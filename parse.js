const fs = require('fs');
const data = JSON.parse(fs.readFileSync('runs.json'));
data.workflow_runs.slice(0, 5).forEach(r => {
  console.log(`${r.id} | ${r.conclusion} | ${r.head_commit.id} | ${r.name}`);
});
