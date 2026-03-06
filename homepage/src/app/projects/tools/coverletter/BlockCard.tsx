'use client'

// ─── BlockCard Component ────────────────────────────────────────────────────
// Renders a single building block as a glass card in the library panel.
// In library mode: clickable to insert into editor, also draggable.
// In editor mode: click-to-select, click-again-to-edit, removable.
// Each card shows a category color dot, optional AI match badge, and the
// block text. Match reason appears as a subtitle when present.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react'
import { Block, CATEGORIES } from './types'

// ─── Props ──────────────────────────────────────────────────────────────────

interface BlockCardProps {
  block: Block                       // The block data to render
  isInEditor: boolean                // true = rendered in the editor panel
  isSelected: boolean                // true = currently selected (blue border)
  matchReason?: string               // If present, AI matched this block
  onSelect: (id: string) => void     // Called when user clicks to select
  onInsert?: (block: Block) => void  // Called when library block is clicked (inserts into editor)
  onManage?: (block: Block) => void  // Called when the library edit button is clicked
  onEdit?: (id: string, newText: string) => void  // Called on edit commit
  onRemove?: (id: string) => void    // Called when remove button is clicked
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function BlockCard({
  block,
  isInEditor,
  isSelected,
  matchReason,
  onSelect,
  onInsert,
  onManage,
  onEdit,
  onRemove,
}: BlockCardProps) {
  // Local state for inline editing (only used in editor mode)
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(block.text)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Look up this block's category colors (fallback to gray if unknown)
  const cat = CATEGORIES[block.category] || CATEGORIES['Closer']

  // Auto-focus and auto-resize the textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
    }
  }, [isEditing])

  useEffect(() => {
    setEditText(block.text)
  }, [block.text])

  // Click handler: in library → insert into editor. In editor → select/edit.
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isInEditor && onInsert) {
      onInsert(block)
    } else if (isInEditor && isSelected && !isEditing) {
      setIsEditing(true)
    } else {
      onSelect(block.id)
    }
  }

  // Save edits when the textarea loses focus
  const handleBlur = () => {
    setIsEditing(false)
    if (editText.trim() !== block.text) {
      onEdit?.(block.id, editText.trim())
    }
  }

  // Keyboard shortcuts: Enter = save, Escape = cancel
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditText(block.text)
      setIsEditing(false)
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleBlur()
    }
  }

  return (
    <div
      // Make library blocks draggable (not while editing in editor)
      draggable={!isEditing}
      onDragStart={(e) => {
        // Serialize the block data so the drop handler can reconstruct it
        e.dataTransfer.setData('application/json', JSON.stringify(block))
        // Allow both copy and move operations
        e.dataTransfer.effectAllowed = 'copyMove'
      }}
      onClick={handleClick}
      className={`
        group relative p-3 rounded-xl border transition-all cursor-pointer
        ${isSelected
          ? 'border-blue-400 dark:border-blue-500 shadow-sm'
          : 'border-glass-border hover:border-glass-border-hover'
        }
        ${isInEditor
          ? 'bg-glass backdrop-blur-sm'
          : 'hover:bg-glass-hover'
        }
        ${matchReason ? 'opacity-100' : ''}
      `}
    >
      {/* Category indicator row: dot + label + optional match badge + actions */}
      <div className="flex items-center gap-2 mb-2">
        {/* Colored dot representing the category */}
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: cat.dot }}
        />
        {/* Category label in monospace */}
        <span
          className="text-[10px] font-bold uppercase tracking-wider font-mono"
          style={{ color: cat.dot }}
        >
          {block.category}
        </span>

        {/* AI match badge: shown when AI matched this block to the job posting */}
        <div className="ml-auto flex items-center gap-1">
          {matchReason && (
            <span
              className="text-[10px] font-bold text-white rounded-full px-2 py-0.5 font-mono"
              style={{ backgroundColor: cat.dot }}
              title={matchReason}
            >
              MATCH
            </span>
          )}

          {!isInEditor && onManage && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onManage(block)
              }}
              className="text-foreground/30 hover:text-foreground/70 transition-colors opacity-0 group-hover:opacity-100"
              title="Edit block"
            >
              <span className="material-symbols-outlined text-base">edit</span>
            </button>
          )}

          {!isInEditor && onRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRemove(block.id)
              }}
              className="text-foreground/30 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
              title="Delete block"
            >
              <span className="material-symbols-outlined text-base">delete</span>
            </button>
          )}

          {/* Remove button: only visible in editor mode, appears on hover */}
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
      </div>

      {/* Block text: either an editable textarea or a read-only paragraph */}
      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={editText}
          onChange={(e) => {
            setEditText(e.target.value)
            // Auto-resize as the user types
            e.target.style.height = 'auto'
            e.target.style.height = e.target.scrollHeight + 'px'
          }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-full bg-transparent border-none outline-none resize-none text-sm leading-relaxed text-foreground"
        />
      ) : (
        <p className="text-sm leading-relaxed text-foreground/80 m-0">
          {block.text}
        </p>
      )}

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

      {/* Match reason tooltip: shown below text in library view */}
      {matchReason && !isInEditor && (
        <p className="text-xs text-foreground/40 mt-2 italic">
          {matchReason}
        </p>
      )}
    </div>
  )
}
