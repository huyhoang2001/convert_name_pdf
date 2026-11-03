# Technical Specification: Document Tab Bar Component

## 1. Context & Purpose

This specification defines the UI/UX standard, sizing rules, layout behaviors, and long-name handling strategies for the **Document Tab Bar** component in a React + Tauri application.

---

## 2. Dimensional Standards

| Property | Standard Value / Range | Description |
| :--- | :--- | :--- |
| **Tab Height** | `36px` - `40px` | Ensures touch/click ergonomics and fits standard title bar heights. |
| **Min Width** | `120px` - `140px` | Guarantees enough space for file icon, minimum text, and close button (`×`). |
| **Max Width** | `220px` - `260px` | Prevents a single long file name from dominating the entire top bar. |
| **Padding (Internal)** | `px-3` (12px left/right) | Breathing room between internal controls and tab edges. |
| **Gap (Between Tabs)**| `4px` - `8px` | Visual separation between adjacent tab items. |
| **Icon Size** | `16px` × `16px` | File type status indicator size. |

---

## 3. Long Name & Overflow Handling Strategies

When file names exceed the `max-width` limit (e.g., `Van_mau_NLXH_CAND_VB2_2026_12_chu_de_co_trich_dan.docx`), the UI must handle text truncation gracefully without breaking the layout.

### Strategy 1: Truncation with Ellipsis (Primary Rule)
* **Behavior:** Clip overflowing text cleanly with `...` at the end of the visible string.
* **Requirements:**
  * Fixed maximum width applied via CSS.
  * Native browser tooltip (`title` attribute) displaying the **full un-truncated file name** on hover.
  * Active status / close buttons (`×`) must remain pinned to the right edge and never get pushed out of view.

### Strategy 2: Dynamic Shrinking & Horizontal Scroll Container
* **Behavior:** 
  1. As more tabs are opened, tab widths dynamically shrink down toward `min-width`.
  2. Once all tabs reach `min-width` and exceed viewport width, the tab bar container converts to a horizontally scrollable area (`overflow-x: auto`) with hidden scrollbars or scroll navigation buttons.

---

## 4. UI Layout & State Specifications

### 4.1 Component Elements
Each Tab Item must contain the following elements from left to right:
1. **File Type Icon:** Visual indicator (e.g., `.docx`, `.pdf`, `.txt`).
2. **File Title Label:** Flex-1 container handling text truncation.
3. **Dirty / Unsaved Indicator (Optional):** Small dot (`•`) when changes are unsaved.
4. **Close Button (`×`):** Hover-triggered or always-visible button to close the tab.

### 4.2 Tab States
* **Active State:** White / elevated background, distinct border or accent line, primary text color.
* **Inactive State:** Semi-transparent / neutral background, muted text color, darkens on hover.
* **Hover State:** Slight background highlight on inactive tabs; close button becomes prominent.

---

## 5. Reference Implementation (React + Tailwind CSS)

```tsx
import React from 'react';
import { X, FileText } from 'lucide-react';

interface Tab {
  id: string;
  name: string;
  isDirty?: boolean;
}

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string, e: React.MouseEvent) => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
}) => {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto bg-slate-100 px-2 py-1 select-none no-scrollbar">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;

        return (
          <div
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            title={tab.name} // Full name on hover
            className={`
              group flex items-center h-9 px-3 
              min-w-[130px] max-w-[240px] 
              rounded-t-lg border border-b-0 text-xs font-medium cursor-pointer transition-all
              ${
                isActive
                  ? 'bg-white border-slate-300 text-slate-800 shadow-sm'
                  : 'bg-slate-200/60 border-transparent text-slate-500 hover:bg-slate-200 hover:text-slate-700'
              }
            `}
          >
            {/* File Icon */}
            <FileText className="w-4 h-4 mr-2 shrink-0 text-blue-600" />

            {/* Truncated File Name */}
            <span className="truncate flex-1 text-left">
              {tab.name}
            </span>

            {/* Unsaved indicator */}
            {tab.isDirty && (
              <span className="w-2 h-2 rounded-full bg-blue-500 ml-1.5 shrink-0" />
            )}

            {/* Close Button */}
            <button
              onClick={(e) => onCloseTab(tab.id, e)}
              className="ml-1.5 p-0.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200 opacity-80 group-hover:opacity-100 shrink-0 transition-opacity"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
```

---

## 6. Verification Checklist for AI Agent

- [ ] `max-width` is constrained on individual tabs to prevent single long titles from taking over the bar.
- [ ] `truncate` (`text-overflow: ellipsis`) is applied strictly to the title text span, NOT the entire tab container.
- [ ] `shrink-0` is applied to the File Icon and Close Button to prevent them from squishing when space is tight.
- [ ] Hovering over any truncated tab displays the `title` attribute with the full file name.
- [ ] The tab container handles horizontal overflow (`overflow-x-auto`) cleanly without breaking page layout.