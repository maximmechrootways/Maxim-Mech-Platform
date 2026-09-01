const fs = require('fs');
const path = '../maxim-frontend/src/pages/subcontractors/SubcontractorDetail.tsx';
let content = fs.readFileSync(path, 'utf8');

const regex = /<Card padding="lg">\s*<CardHeader>Certifications<\/CardHeader>[\s\S]*?<\/Card>\s*<Card padding="lg">\s*<CardHeader>Contractor personnel<\/CardHeader>/;

if (regex.test(content)) {
  content = content.replace(regex, '<Card padding="lg">\n        <CardHeader>Contractor personnel</CardHeader>');
  fs.writeFileSync(path, content);
  console.log('Removed Certifications block');
} else {
  console.log('Could not find regex match');
}
