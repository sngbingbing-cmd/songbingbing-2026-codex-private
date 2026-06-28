import fs from 'node:fs';

const owner = process.argv[2];
if (!owner || !/^[A-Za-z0-9_.-]+$/.test(owner)) {
  console.error('用法: npm run configure:repo -- <GitHub用户名或组织>');
  process.exit(1);
}

const file = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
pkg.repository.url = `https://github.com/${owner}/ai-native-data-workbench.git`;
pkg.build.publish.owner = owner;
fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`已配置 GitHub 仓库: ${pkg.repository.url}`);
