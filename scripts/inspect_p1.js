import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'patrol.xlsx');
const workbook = XLSX.readFile(filePath);
const sheetName = 'P1';
const worksheet = workbook.Sheets[sheetName];

// Get first 10 rows
const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: 0, defval: null });

console.log(`--- First 10 rows of ${sheetName} ---`);
json.slice(0, 10).forEach((row, index) => {
    console.log(`Row ${index}:`, JSON.stringify(row));
});
