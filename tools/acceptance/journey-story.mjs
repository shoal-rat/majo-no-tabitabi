// Walk both episodes in a private browser, reload a real save, and check both outcomes
// of Fran's field trial. Use MV_JOURNEY_QA to choose the screenshot/report directory.
// --mobile: the phones' tier (quality=mobile: people's models on demand and let go again, smaller caches).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, serveGame } from '../../build.mjs';
import { launch, TMP } from '../cdp.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(process.env.MV_JOURNEY_QA || path.join(TMP, 'journey-story'));
await fs.mkdir(output, { recursive: true });
const bundle = await build({});
if (!bundle.ok) throw new Error(bundle.errors);
const { url, server } = await serveGame({ getBuild: async () => bundle });
let page;
let failed = false;
try {
  page = await launch({ width: 1440, height: 810 });
  const clock = await fs.readFile(path.join(testDir, '../trailer/clock.js'), 'utf8');
  const drive = await fs.readFile(path.join(testDir, 'journey-story-input.js'), 'utf8');
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: clock });
  page.on('Runtime.consoleAPICalled', (message) => {
    const line = message.args.map((a) => a.value ?? a.description).join(' ');
    if (message.type === 'error' || line.startsWith('[episode]')) console.log(line.slice(0, 680));
  });
  const base = url + '?quality=' + (process.argv.includes('--mobile') ? 'mobile' : 'medium') + '&pr=1&mute=1&dynres=0';
  async function waitFor(expression) {
    const deadline = Date.now() + 150000;
    while (!(await page.evaluate(expression))) {
      if (Date.now() > deadline) throw new Error('Timed out waiting for ' + expression);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }
  async function run(chapterPart) {
    await page.evaluate(drive + ';true');
    const data = await page.evaluate('window.playTwo(' + JSON.stringify(chapterPart) + ')', {
      timeout: 480000,
    });
    for (const [key, image] of Object.entries(data.pictures)) {
      await fs.writeFile(path.join(output, key + '.jpg'), Buffer.from(image.split(',')[1], 'base64'));
    }
    delete data.pictures;
    if (data.failure) {
      await fs.writeFile(
        path.join(output, 'failure-' + chapterPart + '.json'),
        JSON.stringify(data, null, 2),
      );
      throw new Error(data.failure);
    }
    return data;
  }
  await page.goto(base);
  await waitFor('window.__game?.bootReady === true && window.__game.mode === "title"');
  await page.evaluate("window.__T.press('Enter',80).catch(()=>{});true");
  await waitFor('window.__mvReady === true');
  const first = await run('first');
  await page.goto(base + '&continue=1');
  await waitFor('window.__mvReady === true');
  const last = await run('last');
  const report = { first, last };
  await fs.writeFile(path.join(output, 'journey-story.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('Both episodes, persisted progress, diploma branches and optional rematch passed. ' + output);
} catch (error) {
  failed = true;
  console.error(error);
} finally {
  if (page) await page.close();
  server.close();
}

// The shared CDP driver leaves its long evaluation watchdog pending after success.
process.exit(failed ? 1 : 0);
