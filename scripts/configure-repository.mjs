import fs from 'node:fs';

const owner = process.argv[2];
const repo = process.argv[3] || 'ai-native-data-workbench';
if (!owner || !/^[A-Za-z0-9_.-]+$/.test(owner)) {
  console.error('用法: npm run configure:repo -- <GitHub用户名或组织> [仓库名]');
  process.exit(1);
}
if (!/^[A-Za-z0-9_.-]+$/.test(repo)) {
  console.error('仓库名格式不正确');
  process.exit(1);
}

const file = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
pkg.repository.url = `https://github.com/${owner}/${repo}.git`;
pkg.build.publish.owner = owner;
pkg.build.publish.repo = repo;
fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`已配置 GitHub 仓库: ${pkg.repository.url}`);
