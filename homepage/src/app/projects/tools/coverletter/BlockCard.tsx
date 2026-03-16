'use client'

// ─── BlockCard Component ────────────────────────────────────────────────────
// Renders a single building block as a glass card in the library panel.
// In library mode: clickable to insert into editor, also draggable.
// In editor mode: click-to-select, click-again-to-edit, removable.
// Each card shows a category color dot, optional AI match badge, and the
// block text. Match reason appears as a subtitle when present.
// ─────────────────────────────────────────────────────────────────────────────

// React hooks needed for inline editing:
//   useState — tracks whether the card is in edit mode and the current textarea value
//   useEffect — auto-focuses the textarea when edit mode opens, and syncs text from props
//   useRef    — holds a direct handle to the <textarea> DOM element for imperative resize
import { useState, useEffect, useRef } from 'react'
// Block       — the full library entry shape: { id, category, text, tags[], ... }
// CATEGORIES  — map from category name → { dot, bg, darkBg } color tokens
import { Block, CATEGORIES } from './types'

// ─── Props ──────────────────────────────────────────────────────────────────
// BlockCard is used in TWO different contexts:
//   1. Library panel (right side)  — isInEditor=false: clicking inserts into editor
//   2. Editor panel (left side)    — isInEditor=true:  clicking selects; double-click edits
//
// Not all callbacks are used in both modes — the optional ones (?:) may be undefined.

interface BlockCardProps {
  block: Block                       // The block data to render (text, category, tags)
  isInEditor: boolean                // true = this card lives inside the HighlightEditor
  isSelected: boolean                // true = render blue border highlight ring
  matchReason?: string               // When present, Gemini matched this block to the job posting
  isAISuggestion?: boolean           // true = ephemeral AI-generated block, purple visual variant
  onSelect: (id: string) => void     // Called when user clicks to select the card
  onInsert?: (block: Block) => void  // Library-only: inserts this block into the editor
  onManage?: (block: Block) => void  // Library-only: opens the Edit Block form in the right panel
  onEdit?: (id: string, newText: string) => void  // Editor-only: commits inline text changes
  onRemove?: (id: string) => void    // Removes the card (from editor OR deletes from library)
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function BlockCard({
  block,
  isInEditor,
  isSelected,
  matchReason,
  isAISuggestion = false,
  onSelect,
  onInsert,
  onManage,
  onEdit,
  onRemove,
}: BlockCardProps) {
  // isEditing: true when the user has double-clicked a card in the editor to edit its text.
  // When true, the block text <p> is swapped for a resizable <textarea>.
  // Only meaningful in editor mode (isInEditor=true); library cards don't support inline editing.
  const [isEditing, setIsEditing] = useState(false)

  // editText: the live value of the inline edit textarea.
  // Initialized from block.text and reset to block.text on cancel (Escape key).
  // On commit (blur or Enter), if different from block.text, onEdit() is called.
  const [editText, setEditText] = useState(block.text)

  // textareaRef: direct handle to the <textarea> DOM element.
  // Used to programmatically focus it when edit mode opens, and to read
  // scrollHeight for the auto-resize-to-fit trick.
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Resolve this block's category color tokens from the CATEGORIES map.
  // Falls back to 'Closer' (gray) if the category name isn't in the map.
  // cat.dot = accent color for the indicator circle and text labels
  // cat.bg / cat.darkBg = background tint for the card
  const cat = CATEGORIES[block.category] || CATEGORIES['Closer']

  // When edit mode opens (isEditing flips to true), immediately focus the textarea
  // and auto-resize it to fit the existing text.
  //
  // The scrollHeight trick: set height to 'auto' first so the element collapses to
  // its natural content height, then set it to scrollHeight px to expand to fit —
  // this is the standard CSS-free textarea auto-resize pattern.
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
    }
  }, [isEditing])

  // Sync the textarea value whenever the parent updates the block text.
  // Why? If the user saves an edit, the parent component calls onEdit() and then
  // updates block.text via state. This effect ensures editText stays in sync.
  // Without this, after saving an edit, the textarea would show the old value on
  // the next open.
  useEffect(() => {
    setEditText(block.text)
  }, [block.text])

  // Click handler — behavior differs by mode:
  //
  //   Library mode (isInEditor=false):
  //     Click → onInsert(block): adds the block into the cover letter editor
  //
  //   Editor mode (isInEditor=true):
  //     1st click → onSelect(block.id): highlights the card with a blue ring
  //     2nd click (while selected, not yet editing) → setIsEditing(true): opens inline textarea
  //
  // e.stopPropagation() prevents the click from bubbling up to the page root's onClick handler,
  // which would clear selectedId and undo the selection immediately.
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isInEditor && onInsert) {
      onInsert(block)           // library: insert into editor
    } else if (isInEditor && isSelected && !isEditing) {
      setIsEditing(true)        // editor: second click on selected card → enter edit mode
    } else {
      onSelect(block.id)        // editor: first click → select (highlight) the card
    }
  }

  // Commits an inline edit when the textarea loses focus.
  // Only calls onEdit() if the text actually changed — avoids unnecessary API calls
  // when the user clicks into the card and back out without typing anything.
  // .trim() removes accidental leading/trailing whitespace.
  const handleBlur = () => {
    setIsEditing(false)
    if (editText.trim() !== block.text) {
      onEdit?.(block.id, editText.trim())  // ?. = safe call; onEdit is optional in props
    }
  }

  // Keyboard shortcuts inside the inline edit textarea:
  //   Escape — cancel: restore the original text and exit edit mode without saving
  //   Enter (without Shift) — save: behaves like clicking outside (calls handleBlur)
  //   Shift+Enter — normal newline: fall through to default browser behavior
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditText(block.text)   // revert to the saved text
      setIsEditing(false)        // exit edit mode without committing
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()         // prevent a newline character being typed
      handleBlur()               // commit the edit
    }
  }

  return (
    <div
      // Library blocks are draggable so users can drag them into the editor.
      // Disabled while isEditing so text selection doesn't fight with drag.
      draggable={!isEditing}
      onDragStart={(e) => {
        // Serialize the full Block object as JSON into the drag event's data store.
        // The editor's onDrop handler reads this with e.dataTransfer.getData()
        // and calls editorRef.current.insertBlock() with the reconstructed block.
        e.dataTransfer.setData('application/json', JSON.stringify(block))
        // 'copyMove' advertises that both copy and move are valid drop actions.
        // Most browsers default to 'copy' which shows a + cursor — that's fine here.
        e.dataTransfer.effectAllowed = 'copyMove'
      }}
      onClick={handleClick}
      className={`
        group relative p-3 rounded-xl border transition-all cursor-pointer
        ${isAISuggestion
          ? 'border-purple-400/30 hover:border-purple-400/50'
          : isSelected
            ? 'border-blue-400 dark:border-blue-500 shadow-sm'
            : 'border-glass-border hover:border-glass-border-hover'
        }
        ${isInEditor
          ? 'bg-glass backdrop-blur-sm'
          : 'hover:bg-glass-hover'
        }
        ${matchReason ? 'opacity-100' : ''}
      `}
      style={isAISuggestion ? {
        background: 'linear-gradient(135deg, rgba(139,92,246,0.10), rgba(167,139,250,0.04))',
      } : undefined}
    >
      {/* ── Category row: color dot + label + AI match badge + action buttons ── */}
      <div className="flex items-center gap-2 mb-2">
        {isAISuggestion ? (
          /* AI suggestion header: sparkle icon + paragraph label + "AI SUGGESTION" chip */
          <>
            <span className="material-symbols-outlined text-sm text-purple-400" style={{ fontSize: '14px' }}>
              auto_awesome
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono text-purple-400">
              {block.category}
            </span>
            <span className="ml-auto text-[10px] font-bold text-purple-300 bg-purple-500/20 rounded-full px-2 py-0.5 font-mono">
              AI SUGGESTION
            </span>
          </>
        ) : (
          /* Standard header: color dot + category name + match badge + action buttons */
          <>
            {/* Small filled circle in the category's accent color */}
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: cat.dot }}
            />
            {/* Category name in small caps monospace, same accent color */}
            <span
              className="text-[10px] font-bold uppercase tracking-wider font-mono"
              style={{ color: cat.dot }}
            >
              {block.category}
            </span>

            {/* Right-side controls: AI match badge + edit/delete/remove buttons */}
            <div className="ml-auto flex items-center gap-1">
              {/* AI match badge: rendered only when Gemini matched this block to the job posting.
                  title={matchReason} means hovering shows the full reason as a browser tooltip. */}
              {matchReason && (
                <span
                  className="text-[10px] font-bold text-white rounded-full px-2 py-0.5 font-mono"
                  style={{ backgroundColor: cat.dot }}
                  title={matchReason}
                >
                  MATCH
                </span>
              )}

              {/* Library-only: pencil icon opens the Edit Block form in the right panel.
                  opacity-0 group-hover:opacity-100 = hidden until hovering the card. */}
              {!isInEditor && onManage && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()  // don't trigger the card's onClick (which would insert)
                    onManage(block)
                  }}
                  className="text-foreground/30 hover:text-foreground/70 transition-colors opacity-0 group-hover:opacity-100"
                  title="Edit block"
                >
                  <span className="material-symbols-outlined text-base">edit</span>
                </button>
              )}

              {/* Library-only: trash icon deletes the block from the database. */}
              {!isInEditor && onRemove && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()  // don't trigger insert
                    onRemove(block.id)
                  }}
                  className="text-foreground/30 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  title="Delete block"
                >
                  <span className="material-symbols-outlined text-base">delete</span>
                </button>
              )}

              {/* Editor-only: X icon removes this block instance from the cover letter editor. */}
              {isInEditor && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove?.(block.id) }}
                  className="text-foreground/30 hover:text-foreground/70 transition-colors opacity-0 group-hover:opacity-100"
                  title="Remove from editor"
                >
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Block text: editable textarea in edit mode, read-only paragraph otherwise ── */}
      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={editText}
          onChange={(e) => {
            setEditText(e.target.value)
            // Auto-resize: collapse to 'auto' so the browser recalculates natural height,
            // then expand to scrollHeight so all lines are visible without a scrollbar.
            e.target.style.height = 'auto'
            e.target.style.height = e.target.scrollHeight + 'px'
          }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-full bg-transparent border-none outline-none resize-none text-sm leading-relaxed text-foreground"
        />
      ) : (
        <p className="text-sm leading-relaxed text-foreground/80 m-0 whitespace-pre-wrap">
          {block.text}
        </p>
      )}

      {/* ── Tag pills: shown when the block has any associated tags ──
          Each tag is displayed as a small rounded pill with a # prefix.
          Tags are informational only here — filtering is handled by the parent page. */}
      {block.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {block.tags.map((tag) => (
            <span
              key={tag.id}
              className="px-2 py-0.5 rounded-full border border-glass-border text-[10px] font-medium text-foreground/55"
            >
              #{tag.name}
            </span>
          ))}
        </div>
      )}

      {/* ── AI match reason (library view only) ──
          Shows Gemini's brief explanation of why this block matches the job posting.
          Hidden in editor mode (blocks in the editor don't need the reason shown). */}
      {matchReason && !isInEditor && (
        <p className="text-xs text-foreground/40 mt-2 italic">
          {matchReason}
        </p>
      )}
    </div>
  )
}
