import { GUIDES, Guide } from './guides';

/** "Related" footer for a guide: every other guide, plus GitHub and pricing. */
export function Related({ slug }: { slug: Guide['slug'] }) {
  return (<>
    <h2>Related</h2>
    <ul>
      {GUIDES.filter(g => g.slug !== slug).map(g => <li key={g.slug}><a href={`/guides/${g.slug}`}>{g.title}</a></li>)}
    </ul>
    <p><a href="https://github.com/mfrisaura/loopguard">LoopGuard on GitHub</a> · <a href="/#pricing">Pricing</a></p>
  </>);
}
