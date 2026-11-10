const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    const htmlPath = path.resolve('C:/Users/nguye/.gemini/antigravity-ide/brain/cf1cf855-8a84-4c62-a0ad-f10e8e5f0e92/scratch/nsl_match_report.html');
    await page.goto(`file:///${htmlPath}`, { waitUntil: 'networkidle0', timeout: 30000 });
    
    // Wait extra for Google Fonts to load
    await new Promise(r => setTimeout(r, 3000));
    
    const outputPath = 'C:/Users/nguye/Downloads/NSL_Match_Completion_Report.pdf';
    await page.pdf({
        path: outputPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '0', bottom: '0', left: '0', right: '0' }
    });
    
    console.log(`PDF saved to: ${outputPath}`);
    await browser.close();
})();
