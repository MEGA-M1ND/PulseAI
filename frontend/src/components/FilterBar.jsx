import { CATEGORY_SHORT } from "@/lib/api";

const CHIPS = [["All", "All"], ...Object.entries(CATEGORY_SHORT).map(([full, short]) => [full, short])];

export const FilterBar = ({ active, onSelect }) => (
  <div className="sticky top-14 z-30 backdrop-blur-xl bg-background/80 border-b border-border/60 -mx-4 sm:-mx-6 px-4 sm:px-6">
    <div className="flex gap-2 overflow-x-auto hide-scrollbar py-3" data-testid="filter-bar">
      {CHIPS.map(([full, short]) => {
        const isActive = (active || "All").toLowerCase() === full.toLowerCase();
        return (
          <button key={full} onClick={() => onSelect(full)}
            data-testid={`filter-chip-${short.toLowerCase()}`}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors duration-150 focus:ring-2 focus:ring-ring focus:outline-none ${
              isActive
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}>
            {short}
          </button>
        );
      })}
    </div>
  </div>
);

export default FilterBar;
