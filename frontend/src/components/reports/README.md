# Reports Components

Professional chart components for data visualization and analytics.

## Components

### Chart Components

- **BurndownChart** - Track sprint progress with actual vs ideal burndown
- **VelocityChart** - Measure team capacity across multiple sprints
- **CumulativeFlowChart** - Identify workflow bottlenecks
- **ControlChart** - Analyze cycle time distribution

### Utility Components

- **ReportFilters** - Universal filter sidebar for all reports
- **ReportExport** - Export charts as PNG or CSV

## Usage

```tsx
import { BurndownChart, ReportFilters, ReportExport } from '@/components/reports';

// Use in your report page
<BurndownChart data={burndownData} />
```

## Color Palette

All charts share one color palette:

```ts
Primary: #0052CC (blue)
Success: #00875A (green)
Warning: #FF991F (orange)
Error: #DE350B (red)
Neutral: #8993A4 (gray)

Status Colors:
- To Do: #DFE1E6
- In Progress: #0052CC
- Review/In Review: #FF991F
- Done/Completed: #00875A
- Blocked: #DE350B
- Backlog: #8993A4
```

## Chart Specifications

All charts follow these standards:
- Responsive width: 100%
- Fixed height: 400px
- Grid: Subtle (#E5E7EB)
- Font: System (Inter)
- Animations: 300ms
- Tooltips: White background with shadow

## Export Functionality

Charts support two export formats:
1. **PNG** - High-quality image export (2x scale)
2. **CSV** - Data export for spreadsheet analysis

## Accessibility

- WCAG 2.1 AA compliant color contrast
- Keyboard navigable tooltips
- Screen reader friendly labels
- Clear visual hierarchy
