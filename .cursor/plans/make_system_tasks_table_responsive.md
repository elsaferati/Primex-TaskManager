# Make System Tasks Table Responsive

## Problem
The system tasks table currently has:
- Fixed minimum width of 1000px causing horizontal scroll on smaller screens
- Grid layout that only adapts at xl breakpoint
- Not optimized for mobile/tablet devices
- Columns may be too cramped on smaller desktop screens

## Solution
Implement responsive breakpoints for:
1. **Mobile (< 640px)**: Card-based layout instead of table
2. **Tablet (640px - 1024px)**: Adjusted column widths, hide less important columns
3. **Desktop (1024px - 1280px)**: Optimized column widths
4. **Large Desktop (1280px+)**: Current xl layout

## Changes Required

### 1. Update GRID_CLASS for multiple breakpoints
**File:** `frontend/src/app/(app)/system-tasks/page.tsx`
**Line 178:** Update GRID_CLASS to include responsive breakpoints:
- Mobile: Hide table, show cards (handled separately)
- sm (640px+): Compact grid with essential columns
- md (768px+): Add more columns
- lg (1024px+): More columns visible
- xl (1280px+): Full columns as current

### 2. Remove fixed min-width constraint
**Line 3219:** Update the wrapper div to be responsive:
- Remove `min-w-[1000px]` or make it responsive
- Add responsive classes for different screen sizes

### 3. Add mobile card layout
**Lines 3314-3370:** Add conditional rendering:
- On mobile (< md): Show card layout with stacked information
- On md+: Show table grid layout

### 4. Adjust column visibility
Hide less critical columns on smaller screens:
- Mobile: Title, Owner, Priority, Actions
- Tablet: Add Department, Frequency
- Desktop: Add Finish by
- Large Desktop: All columns

## Implementation Strategy

1. Create responsive GRID_CLASS variants for different breakpoints
2. Add mobile card component that shows task info in a vertical layout
3. Use Tailwind's responsive prefixes (sm:, md:, lg:, xl:) for conditional styling
4. Ensure sticky header works on all screen sizes
5. Test that print styles remain unchanged

## Result
- Mobile: Clean card layout, easy to read
- Tablet: Compact table with essential columns
- Desktop: Full table with all columns optimized
- Sticky header works on all screen sizes
- No horizontal scrolling on any device
- Print styles preserved
