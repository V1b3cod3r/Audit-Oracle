import 'dotenv/config';
import { generateBriefing } from './briefing.js';

generateBriefing()
  .then((b) => {
    console.log(`\nGenerated briefing with ${b.articleCount} articles (${b.keyStories} key stories).`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Briefing failed:', err);
    process.exit(1);
  });
