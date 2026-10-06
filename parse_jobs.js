const fs = require('fs');
const data = JSON.parse(fs.readFileSync('jobs.json'));
const job = data.jobs[0];
console.log(`Job ID: ${job.id}`);
console.log(`Steps:`);
job.steps.forEach(s => {
  console.log(`  ${s.name} - ${s.conclusion}`);
});
