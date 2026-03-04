import { useState, useRef, useCallback, useEffect } from "react";

const CATEGORIES = {
  "Client-Facing": { color: "#2563eb", bg: "#dbeafe" },
  "Full-Stack": { color: "#059669", bg: "#d1fae5" },
  "AI/ML": { color: "#7c3aed", bg: "#ede9fe" },
  "Embedded": { color: "#dc2626", bg: "#fee2e2" },
  "Hackathons": { color: "#d97706", bg: "#fef3c7" },
  "Soft Skills": { color: "#0891b2", bg: "#cffafe" },
  "Closer": { color: "#6b7280", bg: "#f3f4f6" },
};

const INITIAL_BLOCKS = [
  {
    id: "1",
    category: "Client-Facing",
    text: "As a Customer Application Engineer at Ivalua, I work directly with enterprise clients like T-Mobile on technical implementations, platform upgrades, and production support — bridging the gap between client needs and engineering execution.",
  },
  {
    id: "2",
    category: "Full-Stack",
    text: "I build full-stack applications using Next.js, Node, and React, deploying with Docker on AWS infrastructure managed through Terraform — I'm comfortable owning a feature from database schema to production deployment.",
  },
  {
    id: "3",
    category: "AI/ML",
    text: "I've built practical AI tooling including DepScope, a repository due diligence tool that analyzes codebases for technical risk, and ClaimGraph, an AI-powered fact-checking system with trust graph visualization.",
  },
  {
    id: "4",
    category: "Embedded",
    text: "My embedded systems experience with STM32 microcontrollers and bare-metal C gives me a strong foundation in resource-constrained programming, hardware-software interfaces, and systems-level thinking.",
  },
  {
    id: "5",
    category: "Hackathons",
    text: "I've placed in multiple competitive hackathons including second place at AWS Builder Loft and the Before the Ballot civic tech hackathon — I thrive under time pressure and ship working software fast.",
  },
  {
    id: "6",
    category: "Soft Skills",
    text: "Working with enterprise clients has taught me to translate complex technical constraints into language stakeholders understand, and to scope work realistically when requirements are ambiguous.",
  },
  {
    id: "7",
    category: "Closer",
    text: "I'd welcome the chance to discuss how my experience building production tools and working with enterprise clients could contribute to your team. I'm available for a conversation at your convenience.",
  },
  {
    id: "8",
    category: "Full-Stack",
    text: "I have hands-on experience with the MERN stack, building and maintaining REST APIs, implementing authentication flows, and managing CI/CD pipelines for team projects.",
  },
  {
    id: "9",
    category: "AI/ML",
    text: "I've worked with MCP servers and multi-agent frameworks, and I stay current with developments in transformer architectures and model optimization — I understand both the application layer and the infrastructure underneath.",
  },
  {
    id: "10",
    category: "Hackathons",
    text: "At hackathons I typically lead the system architecture decisions and own the backend integration work, coordinating a team of 3-4 to deliver a polished demo within 24-48 hours.",
  },
  {
    id: "11",
    category: "Soft Skills",
    text: "I'm drawn to teams that value clean engineering over flashy tooling — I'd rather ship a well-tested feature with clear documentation than a brittle prototype that demos well.",
  },
  {
    id: "12",
    category: "Closer",
    text: "I'm currently based in the Bay Area and available to start immediately. I'd love to learn more about the technical challenges your team is tackling.",
  },
];

function Block({ block, isSelected, isInEditor, onSelect, onEdit, onRemove, onDragStart, matchScore }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(block.text);
  const textareaRef = useRef(null);
  const cat = CATEGORIES[block.category] || { color: "#6b7280", bg: "#f3f4f6" };

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [isEditing]);

  const handleClick = (e) => {
    e.stopPropagation();
    if (isInEditor && isSelected && !isEditing) {
      setIsEditing(true);
    } else {
      onSelect?.(block.id);
    }
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (editText.trim() !== block.text) {
      onEdit?.(block.id, editText.trim());
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      setEditText(block.text);
      setIsEditing(false);
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleBlur();
    }
  };

  return (
    <div
      draggable={!isEditing}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", JSON.stringify(block));
        onDragStart?.();
      }}
      onClick={handleClick}
      style={{
        padding: "10px 14px",
        borderRadius: "8px",
        border: `2px solid ${isSelected ? cat.color : "transparent"}`,
        background: isInEditor ? "#fff" : cat.bg,
        cursor: isEditing ? "text" : "grab",
        position: "relative",
        transition: "all 0.2s ease",
        boxShadow: isSelected
          ? `0 0 0 1px ${cat.color}40`
          : "0 1px 2px rgba(0,0,0,0.04)",
        marginBottom: "6px",
        opacity: matchScore === 0 ? 0.45 : 1,
        transform: matchScore > 0 ? "scale(1)" : "scale(1)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
        <span
          style={{
            display: "inline-block",
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: cat.color,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: "10px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: cat.color,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {block.category}
        </span>
        {matchScore > 0 && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: "10px",
              fontWeight: 700,
              color: "#fff",
              background: cat.color,
              borderRadius: "10px",
              padding: "1px 8px",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            MATCH
          </span>
        )}
        {isInEditor && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove?.(block.id); }}
            style={{
              marginLeft: matchScore > 0 ? "6px" : "auto",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#9ca3af",
              fontSize: "16px",
              lineHeight: 1,
              padding: "0 2px",
              fontFamily: "inherit",
            }}
            title="Remove from editor"
          >
            ×
          </button>
        )}
      </div>
      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={editText}
          onChange={(e) => {
            setEditText(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = e.target.scrollHeight + "px";
          }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          style={{
            width: "100%",
            border: "none",
            outline: "none",
            resize: "none",
            fontSize: "13.5px",
            lineHeight: 1.6,
            color: "#1f2937",
            fontFamily: "'Source Serif 4', Georgia, serif",
            background: "transparent",
            padding: 0,
          }}
        />
      ) : (
        <p
          style={{
            margin: 0,
            fontSize: "13.5px",
            lineHeight: 1.6,
            color: "#1f2937",
            fontFamily: "'Source Serif 4', Georgia, serif",
          }}
        >
          {block.text}
        </p>
      )}
    </div>
  );
}

export default function CoverLetterWorkbench() {
  const [libraryBlocks, setLibraryBlocks] = useState(INITIAL_BLOCKS);
  const [editorBlocks, setEditorBlocks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [jobPosting, setJobPosting] = useState("");
  const [matchedIds, setMatchedIds] = useState(new Set());
  const [isMatching, setIsMatching] = useState(false);
  const [filterCategory, setFilterCategory] = useState("All");
  const [isDragOver, setIsDragOver] = useState(false);
  const [newBlockText, setNewBlockText] = useState("");
  const [newBlockCategory, setNewBlockCategory] = useState("Soft Skills");
  const [showAddForm, setShowAddForm] = useState(false);
  const editorRef = useRef(null);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragOver(false);
      try {
        const block = JSON.parse(e.dataTransfer.getData("text/plain"));
        if (!editorBlocks.find((b) => b.id === block.id)) {
          setEditorBlocks((prev) => [...prev, { ...block }]);
        }
      } catch {}
    },
    [editorBlocks]
  );

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const removeFromEditor = (id) => {
    setEditorBlocks((prev) => prev.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const editBlock = (id, newText) => {
    setEditorBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, text: newText } : b))
    );
    setLibraryBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, text: newText } : b))
    );
  };

  const addNewBlock = () => {
    if (!newBlockText.trim()) return;
    const newBlock = {
      id: Date.now().toString(),
      category: newBlockCategory,
      text: newBlockText.trim(),
    };
    setLibraryBlocks((prev) => [...prev, newBlock]);
    setNewBlockText("");
    setShowAddForm(false);
  };

  const matchBlocks = async () => {
    if (!jobPosting.trim()) return;
    setIsMatching(true);
    try {
      const blockList = libraryBlocks
        .map((b, i) => `[${b.id}] (${b.category}) ${b.text}`)
        .join("\n");

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [
            {
              role: "user",
              content: `You are helping match cover letter building blocks to a job posting. Return ONLY a JSON array of the IDs (as strings) of the 3-4 most relevant blocks for this job. No explanation, no markdown, just the JSON array.

Job Posting:
${jobPosting}

Available blocks:
${blockList}`,
            },
          ],
        }),
      });

      const data = await response.json();
      const text = data.content
        .map((c) => c.text || "")
        .join("")
        .replace(/```json|```/g, "")
        .trim();
      const ids = JSON.parse(text);
      setMatchedIds(new Set(ids.map(String)));
    } catch (err) {
      console.error("Match error:", err);
      setMatchedIds(new Set());
    }
    setIsMatching(false);
  };

  const sortedLibrary = [...libraryBlocks]
    .filter((b) => filterCategory === "All" || b.category === filterCategory)
    .sort((a, b) => {
      const aMatch = matchedIds.has(a.id) ? 1 : 0;
      const bMatch = matchedIds.has(b.id) ? 1 : 0;
      return bMatch - aMatch;
    });

  const copyToClipboard = () => {
    const text = editorBlocks.map((b) => b.text).join("\n\n");
    navigator.clipboard.writeText(text);
  };

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Source+Serif+4:wght@400;600;700&family=DM+Sans:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <div
        onClick={() => setSelectedId(null)}
        style={{
          display: "flex",
          height: "100vh",
          background: "#f8f7f4",
          fontFamily: "'DM Sans', sans-serif",
          color: "#1f2937",
          overflow: "hidden",
        }}
      >
        {/* LEFT: Editor */}
        <div
          style={{
            flex: "1 1 50%",
            display: "flex",
            flexDirection: "column",
            borderRight: "1px solid #e5e2db",
          }}
        >
          {/* Job posting input */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e2db" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "8px",
              }}
            >
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "#9ca3af",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                Job Posting
              </span>
              <button
                onClick={matchBlocks}
                disabled={isMatching || !jobPosting.trim()}
                style={{
                  padding: "6px 16px",
                  borderRadius: "6px",
                  border: "none",
                  background:
                    isMatching || !jobPosting.trim() ? "#d1d5db" : "#1f2937",
                  color: "#fff",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor:
                    isMatching || !jobPosting.trim() ? "default" : "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                  transition: "background 0.15s",
                }}
              >
                {isMatching ? "Matching..." : "Match Blocks"}
              </button>
            </div>
            <textarea
              value={jobPosting}
              onChange={(e) => setJobPosting(e.target.value)}
              placeholder="Paste a job posting here, then click Match Blocks to find the best sentences from your library..."
              style={{
                width: "100%",
                height: "72px",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid #e5e2db",
                background: "#fff",
                fontSize: "13px",
                fontFamily: "'Source Serif 4', Georgia, serif",
                lineHeight: 1.5,
                color: "#374151",
                resize: "none",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Editor area */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "12px 20px 8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "#9ca3af",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                Cover Letter — {editorBlocks.length} blocks
              </span>
              {editorBlocks.length > 0 && (
                <button
                  onClick={copyToClipboard}
                  style={{
                    padding: "4px 12px",
                    borderRadius: "6px",
                    border: "1px solid #e5e2db",
                    background: "#fff",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer",
                    color: "#6b7280",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  Copy Text
                </button>
              )}
            </div>
            <div
              ref={editorRef}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={() => setIsDragOver(false)}
              style={{
                flex: 1,
                margin: "0 20px 20px",
                padding: "16px",
                borderRadius: "10px",
                border: `2px dashed ${isDragOver ? "#2563eb" : "#e5e2db"}`,
                background: isDragOver ? "#eff6ff" : "#fff",
                overflowY: "auto",
                transition: "all 0.2s ease",
                minHeight: "200px",
              }}
            >
              {editorBlocks.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    color: "#9ca3af",
                    fontSize: "14px",
                    textAlign: "center",
                    lineHeight: 1.8,
                  }}
                >
                  Drag blocks from the library →
                  <br />
                  or click Match Blocks to find the best ones
                </div>
              ) : (
                editorBlocks.map((block) => (
                  <Block
                    key={block.id}
                    block={block}
                    isSelected={selectedId === block.id}
                    isInEditor={true}
                    onSelect={setSelectedId}
                    onEdit={editBlock}
                    onRemove={removeFromEditor}
                    matchScore={matchedIds.has(block.id) ? 1 : -1}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Library */}
        <div
          style={{
            flex: "1 1 50%",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "16px 20px 10px",
              borderBottom: "1px solid #e5e2db",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "10px",
              }}
            >
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "#9ca3af",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                Block Library — {sortedLibrary.length} blocks
              </span>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                style={{
                  padding: "4px 12px",
                  borderRadius: "6px",
                  border: "1px solid #e5e2db",
                  background: showAddForm ? "#1f2937" : "#fff",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                  color: showAddForm ? "#fff" : "#6b7280",
                  fontFamily: "'DM Sans', sans-serif",
                  transition: "all 0.15s",
                }}
              >
                {showAddForm ? "Cancel" : "+ Add Block"}
              </button>
            </div>

            {/* Category filter pills */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "4px",
              }}
            >
              {["All", ...Object.keys(CATEGORIES)].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  style={{
                    padding: "3px 10px",
                    borderRadius: "20px",
                    border:
                      filterCategory === cat
                        ? "1.5px solid #1f2937"
                        : "1.5px solid #e5e2db",
                    background:
                      filterCategory === cat ? "#1f2937" : "transparent",
                    color: filterCategory === cat ? "#fff" : "#6b7280",
                    fontSize: "10px",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                    transition: "all 0.15s",
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Add block form */}
          {showAddForm && (
            <div
              style={{
                padding: "12px 20px",
                borderBottom: "1px solid #e5e2db",
                background: "#fafaf8",
              }}
            >
              <select
                value={newBlockCategory}
                onChange={(e) => setNewBlockCategory(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  borderRadius: "6px",
                  border: "1px solid #e5e2db",
                  fontSize: "12px",
                  marginBottom: "6px",
                  fontFamily: "'DM Sans', sans-serif",
                  background: "#fff",
                  outline: "none",
                }}
              >
                {Object.keys(CATEGORIES).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <textarea
                value={newBlockText}
                onChange={(e) => setNewBlockText(e.target.value)}
                placeholder="Write a new building block..."
                style={{
                  width: "100%",
                  height: "60px",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  border: "1px solid #e5e2db",
                  fontSize: "13px",
                  fontFamily: "'Source Serif 4', Georgia, serif",
                  resize: "none",
                  outline: "none",
                  marginBottom: "6px",
                  boxSizing: "border-box",
                }}
              />
              <button
                onClick={addNewBlock}
                disabled={!newBlockText.trim()}
                style={{
                  padding: "6px 16px",
                  borderRadius: "6px",
                  border: "none",
                  background: newBlockText.trim() ? "#1f2937" : "#d1d5db",
                  color: "#fff",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: newBlockText.trim() ? "pointer" : "default",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Add to Library
              </button>
            </div>
          )}

          {/* Library blocks */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "12px 20px 20px",
            }}
          >
            {sortedLibrary.map((block) => (
              <Block
                key={block.id}
                block={block}
                isSelected={selectedId === block.id}
                isInEditor={false}
                onSelect={setSelectedId}
                matchScore={matchedIds.has(block.id) ? 1 : 0}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}