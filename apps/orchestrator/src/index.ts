import "dotenv/config";

async function main() {
  console.log("argus orchestrator starting");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
