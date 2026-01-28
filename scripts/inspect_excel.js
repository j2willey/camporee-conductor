import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'patrol.xlsx');

if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
}

const workbook = XLSX.readFile(filePath);
const sheetNames = workbook.SheetNames;

console.log('Sheets found:', sheetNames);

sheetNames.forEach(sheetName => {
    console.log(`\n--- Sheet: ${sheetName} ---`);
    const worksheet = workbook.Sheets[sheetName];
    // Get headers (first row)
    const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    if (json.length > 0) {
        console.log('Headers:', json[0]);
        console.log('First row of data:', json[1]);
    } else {
        console.log('Empty sheet');
    }
});
