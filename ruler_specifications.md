# Technical Specification: Top & Side Rulers (Google Docs Style)

## 1. Context & Objective
This document outlines the detailed specifications for implementing interactive **Top (Horizontal)** and **Side/Right (Vertical)** rulers in a document editor built with **React** and **Tauri**.

The goal is to replicate the layout, margin management, indentation behavior, and visual cues found in professional document editors like Google Docs and Microsoft Word.

---

## 2. Core Concepts & Units

### 2.1 Coordinate System & Scaling
- **Measurement Units:** Inches (`in`) or Centimeters (`cm`), rendered as Pixels (`px`).
- **Resolution:** Typically $1\text{ inch} = 96\text{ px}$.
- **Zoom Level Sensitivity:** Ruler scale and markers MUST scale dynamically with the document canvas zoom percentage ($Zoom \% \times Scale$).
- **Page Canvas Reference:** Ruler measurements start relative to the **Document Page Edge**, NOT the viewport/screen edge.

---

## 3. Top Ruler (Horizontal Ruler) Specifications

### 3.1 Visual Structure
1. **Background Bar:**
   - **Page Area (White / Light):** Represents the printable/writeable horizontal space between margins.
   - **Margin Areas (Gray / Darker):** Represents the left and right margins outside the printable canvas.
2. **Ticks and Numbers:**
   - Minor tick marks (e.g., every $1/16\text{ inch}$ or $1\text{ mm}$).
   - Major tick marks with numeric labels (e.g., $1, 2, 3 \ldots$) centered on whole units.
   - $0$ index aligns exactly with the **Inside Left Margin** boundary (or Page Left Edge depending on settings; standard Google Docs aligns $0$ with the left margin boundary).

### 3.2 Interactive Controls & Handles

#### A. Left Margin Drag Boundary
- **Visual:** Vertical division line between the left gray margin and middle white active zone.
- **Behavior:** Dragging resizes the **entire document's left margin**.
- **Constraint:** Adjusting the left margin shifts all paragraph contents horizontally across the page.

#### B. First-Line Indent Marker
- **Visual Icon:** Blue rectangle (or small top bar) positioned at the top of the ruler slider.
- **Behavior:** Controls the indentation of only the **first line** of the active paragraph.
- **Scope:** Applies to current cursor selection / active paragraph(s).

#### C. Left Indent Marker (Hanging / Left Indent)
- **Visual Icon:** Blue inverted triangle (or small bottom triangle) positioned directly below the First-Line Indent rectangle.
- **Behavior:** 
  - Dragging the triangle alone moves both the First-Line Indent and Left Indent together (preserving relative distance).
  - Dragging with specific key bindings (or bottom handle) changes the **Hanging Indent** (lines $2, 3, \ldots$ of paragraph).

#### D. Right Indent Marker
- **Visual Icon:** Blue triangle pointing upward on the right side of the active area.
- **Behavior:** Controls the right padding/margin for selected paragraph(s).

#### E. Right Margin Drag Boundary
- **Visual:** Vertical division line between the active white zone and right gray margin.
- **Behavior:** Dragging changes the document's global **Right Margin** width.

#### F. Tab Stop Markers (OnClick Interaction)
- **Behavior:** Single-clicking anywhere inside the active white ruler bar drops a Tab Stop marker:
  - **Left Tab Marker** ($\llcorner$ shape)
  - **Center Tab Marker** ($\bot$ shape)
  - **Right Tab Marker** ($\lrcorner$ shape)
- **Dragging/Removal:** Tab markers can be dragged horizontally along the ruler or dragged *downward off the ruler* to be removed.

---

## 4. Side/Right Ruler (Vertical Ruler) Specifications

> **Note on "Right" vs "Left" Side Ruler:** 
> - Standard document editors (Google Docs, Word) place the vertical ruler on the **LEFT side**.
> - If placed on the **RIGHT side**, the functionality remains symmetrical, but UI positioning is mirrored.

### 4.1 Visual Structure
1. **Vertical Orientation:** Displays vertically alongside the page canvas.
2. **Active vs Non-Active Zones:**
   - **Top Margin Area (Gray):** Non-printable space at the top of the page.
   - **Active Body Area (White):** Printable vertical space for text flow.
   - **Bottom Margin Area (Gray):** Non-printable space at the bottom of the page.
3. **Ticks and Numbers:** Measured vertically top-to-bottom ($0$ aligns with the top printable margin boundary).

### 4.2 Interactive Controls & Behavior

#### A. Top Margin Boundary (Vertical Drag)
- **Visual:** Horizontal dividing line between top gray zone and white active body zone.
- **Cursor Icon:** `ns-resize` / `row-resize` ($\updownarrow$).
- **Behavior:** Resizes the document's **Top Margin**. Pushes or pulls body text vertically.

#### B. Bottom Margin Boundary (Vertical Drag)
- **Visual:** Horizontal dividing line between white active body zone and bottom gray zone.
- **Cursor Icon:** `ns-resize` / `row-resize` ($\updownarrow$).
- **Behavior:** Resizes the document's **Bottom Margin**. Triggers page breaks earlier or later.

#### C. Row / Table Height Resize Cues (Optional Advanced)
- When the cursor is inside a table cell, the vertical ruler displays markers for individual **Table Row heights**, allowing interactive vertical row resizing.

---

## 5. Live Interaction & Alignment Features

### 5.1 Dynamic Alignment Guidelines (Guide Line Overlay)
- **Trigger:** When any margin, indent, or tab marker is actively dragged.
- **Visual Effect:** Render a thin, semi-transparent dashed vertical or horizontal line extending across the entire page editor canvas.
- **Purpose:** Gives the user real-time visual alignment with the text content below/beside the ruler.

### 5.2 Tooltip Feedback
- Display real-time numerical measurement values during drag operations (e.g., `Left Margin: 1.25 in`, `First Line Indent: 0.5 in`).

---

## 6. Data Model & React State Architecture

```typescript
interface DocumentMargins {
  top: number;    // in pixels or inches
  bottom: number;
  left: number;
  right: number;
}

interface ParagraphFormatting {
  firstLineIndent: number; // offset relative to left margin
  leftIndent: number;      // offset relative to left margin
  rightIndent: number;     // offset relative to right margin
}

interface TabStop {
  id: string;
  position: number; // offset in pixels/inches from left margin
  type: 'left' | 'center' | 'right' | 'decimal';
}
```

---

## 7. Checklist for AI Agent / Code Implementation

- [ ] **Synchronization:** Ensure ruler scroll offset matches the document viewport scroll (`scrollTop` & `scrollLeft`).
- [ ] **Zoom Alignment:** Ensure $1\text{ ruler unit}$ accurately equals page pixel scaling when zooming in/out.
- [ ] **Mouse Events:** Implement `onMouseDown`, `onMouseMove`, `onMouseUp` globally on `window` during dragging so mouse capture isn't lost when dragging fast.
- [ ] **Boundary Clamping:** Prevent margins from overlapping each other (e.g., Left Margin + Right Margin cannot exceed total Page Width).
- [ ] **Tauri Performance:** Keep drag calculations in React state performant using `requestAnimationFrame` or CSS Variables to avoid canvas re-render lag.