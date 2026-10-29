/**
 * Concurrency test for atomic wallet deductions.
 *
 * Sends 20 simultaneous SMS requests against a wallet with
 * 10 credits. Each request costs 1 credit.
 *
 * Expected: 10 successful requests and 10 insufficient-credit
 * responses. No requests should overspend the wallet.
 *
 * Usage:
 *   export JWT_TOKEN="<your-token>"
 *   node scripts/demo-20-parallel.js
 */

const token = process.env.JWT_TOKEN;

if (!token) {
  console.error("Error: JWT_TOKEN environment variable is required.");
  process.exit(1);
}

const URL = "http://localhost:3000/sms/send";
const PARALLEL_REQUESTS = 20;
const EXPECTED_SUCCESSES = 10;
const EXPECTED_REJECTIONS = 10;

const fireRequest = () =>
  fetch(URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: ["9841234567"],
      message: "x",
    }),
  })
    .then((response) => response.status)
    .catch(() => null);

async function main() {
  console.log(`Sending ${PARALLEL_REQUESTS} concurrent SMS requests...`);

  const statuses = await Promise.all(
    Array.from({ length: PARALLEL_REQUESTS }, fireRequest),
  );

  const successes = statuses.filter((status) => status === 200).length;
  const insufficient = statuses.filter((status) => status === 402).length;
  const unexpected = statuses.length - successes - insufficient;

  console.log(`200 (Success):      ${successes}`);
  console.log(`402 (Insufficient): ${insufficient}`);
  console.log(`Unexpected results: ${unexpected}`);

  const passed =
    successes === EXPECTED_SUCCESSES &&
    insufficient === EXPECTED_REJECTIONS &&
    unexpected === 0;

  if (!passed) {
    console.error("FAIL: Unexpected concurrency test results.");
    process.exitCode = 1;
    return;
  }

  console.log("PASS: Wallet credits were not overspent.");
}

main().catch((error) => {
  console.error("Concurrency test failed:", error);
  process.exitCode = 1;
});
