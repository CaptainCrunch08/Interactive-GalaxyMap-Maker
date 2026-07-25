import { useCampaignStore } from "../store/useCampaignStore";

export function SiteTitle() {
  const campaign = useCampaignStore((s) => s.campaign);

  return (
    <div className="flex items-baseline gap-2 min-w-0 shrink">
      <span className="font-display text-xs sm:text-sm text-cyan tracking-[0.12em] uppercase whitespace-nowrap">
        Galaxy Map Maker
      </span>
      <span className="text-panel-border text-sm select-none" aria-hidden>
        –
      </span>
      <span
        className="font-body text-sm text-brass truncate max-w-[10rem] sm:max-w-xs"
        title={campaign.name}
      >
        {campaign.name}
      </span>
    </div>
  );
}
