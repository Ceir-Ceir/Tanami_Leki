
import 'dotenv/config';
import fs from 'fs';
import path from 'path';

console.log('Current working directory:', process.cwd());
console.log('Checking for .env file at:', path.resolve(process.cwd(), '.env'));
console.log('File exists?', fs.existsSync(path.resolve(process.cwd(), '.env')));

console.log('DIRECT_URL loaded?', !!process.env.DIRECT_URL);
if (process.env.DIRECT_URL) {
    console.log('DIRECT_URL starts with:', process.env.DIRECT_URL.substring(0, 15));
} else {
    console.log('All env vars:', Object.keys(process.env));
}
