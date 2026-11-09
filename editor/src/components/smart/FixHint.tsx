import { blogUrl, recommendationFor } from '@core/arch/fixes';
import { t } from '../../i18n';

/** recommendation of a lint rule / capacity status: what to do, plus a "Read more" link to the blog post when there is one */
export function FixHint({ ruleKey }: { ruleKey: string }) {
  const rec = recommendationFor(ruleKey);
  if (!rec) return null;
  return (
    <div className="fix-hint" data-testid="fix-hint">
      <b>{t(rec.title)}.</b> <span>{t(rec.steps)}</span>
      {rec.blogSlug && <> <a href={blogUrl(rec.blogSlug)} target="_blank" rel="noreferrer">{t('Read more')}</a></>}
    </div>
  );
}
