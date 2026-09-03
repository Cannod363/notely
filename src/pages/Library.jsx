import React, { useState, useEffect } from "react";
import { supabase } from "@/api/base44Client";
import RhythmCard from "@/components/RhythmCard";
import { Loader2, Music2, Search, CheckSquare, Trash2, X, Archive } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

const ARCHIVE_MAX = 30;
const ARCHIVE_TTL_MS = 15 * 24 * 60 * 60 * 1000;

export default function Library() {
  const [rhythms, setRhythms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [view, setView] = useState("library");

  const load = async () => {
    setLoading(true);
    try {
      let { data: list, error } = await supabase
        .from("rhythms")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      list = list || [];

      const now = Date.now();
      const toPurge = list.filter(
        (r) => r.archived && r.archived_date && now - new Date(r.archived_date).getTime() > ARCHIVE_TTL_MS
      );
      if (toPurge.length) {
        await Promise.all(
          toPurge.map((r) => supabase.from("rhythms").delete().eq("id", r.id))
        );
        const purgeIds = new Set(toPurge.map((r) => r.id));
        list = list.filter((r) => !purgeIds.has(r.id));
      }

      setRhythms(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const activeCount = rhythms.filter((r) => !r.archived).length;
  const archivedCount = rhythms.length - activeCount;

  const handleDelete = async (id) => {
    const r = rhythms.find((x) => x.id === id);
    if (r?.locked) {
      toast.error("Unlock the rhythm first");
      return;
    }
    if (archivedCount >= ARCHIVE_MAX) {
      toast.error(`Archive is full (${ARCHIVE_MAX}). Permanently delete some first.`);
      return;
    }
    const archived_date = new Date().toISOString();
    setRhythms((prev) =>
      prev.map((x) => (x.id === id ? { ...x, archived: true, archived_date } : x))
    );
    const { error } = await supabase
      .from("rhythms")
      .update({ archived: true, archived_date })
      .eq("id", id);
    if (error) {
      toast.error("Failed");
      load();
    } else {
      toast.success("Moved to archive");
    }
  };

  const handlePermanentDelete = async (id) => {
    const r = rhythms.find((x) => x.id === id);
    if (r?.locked) {
      toast.error("Unlock the rhythm first");
      return;
    }
    const { error } = await supabase.from("rhythms").delete().eq("id", id);
    if (error) {
      toast.error("Delete failed");
      return;
    }
    setRhythms((prev) => prev.filter((x) => x.id !== id));
    setSelected((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
    toast.success("Deleted permanently");
  };

  const handleRestore = async (id) => {
    setRhythms((prev) =>
      prev.map((x) => (x.id === id ? { ...x, archived: false, archived_date: null } : x))
    );
    const { error } = await supabase
      .from("rhythms")
      .update({ archived: false, archived_date: null })
      .eq("id", id);
    if (error) {
      toast.error("Failed");
      load();
    } else {
      toast.success("Restored");
    }
  };

  const handleRename = async (id, title) => {
    setRhythms((prev) => prev.map((x) => (x.id === id ? { ...x, title } : x)));
    const { error } = await supabase.from("rhythms").update({ title }).eq("id", id);
    if (error) {
      toast.error("Rename failed");
      load();
    } else {
      toast.success("Renamed");
    }
  };

  const handleToggleLock = async (id) => {
    const r = rhythms.find((x) => x.id === id);
    const locked = !r?.locked;
    setRhythms((prev) => prev.map((x) => (x.id === id ? { ...x, locked } : x)));
    const { error } = await supabase.from("rhythms").update({ locked }).eq("id", id);
    if (error) {
      toast.error("Failed");
      load();
    } else {
      toast.success(locked ? "Locked" : "Unlocked");
    }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const handleDeleteSelected = async () => {
    const ids = [...selected].filter((id) => !rhythms.find((r) => r.id === id)?.locked);
    if (ids.length === 0) {
      toast.error("Selected rhythms are locked");
      return;
    }
    if (view === "archived") {
      const { error } = await supabase.from("rhythms").delete().in("id", ids);
      if (error) {
        toast.error("Delete failed");
      } else {
        setRhythms((prev) => prev.filter((r) => !selected.has(r.id)));
        toast.success(`Deleted ${ids.length} rhythms`);
      }
    } else {
      if (archivedCount + ids.length > ARCHIVE_MAX) {
        toast.error(`Archive can only hold ${ARCHIVE_MAX}.`);
        return;
      }
      const archived_date = new Date().toISOString();
      const { error } = await supabase
        .from("rhythms")
        .update({ archived: true, archived_date })
        .in("id", ids);
      if (error) {
        toast.error("Failed");
      } else {
        setRhythms((prev) =>
          prev.map((r) => (selected.has(r.id) ? { ...r, archived: true, archived_date } : r))
        );
        toast.success(`Moved ${ids.length} to archive`);
      }
    }
    setSelected(new Set());
    setSelectMode(false);
  };

  const viewRhythms = rhythms.filter((r) => !!r.archived === (view === "archived"));
  const filtered = viewRhythms.filter((r) =>
    r.title?.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="px-5 pt-10 pb-32 min-h-screen relative">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="notely-title text-[42px] leading-none">library</h1>
          <p className="text-sm text-primary/90 mt-1.5">
            {view === "library" ? `${activeCount}/30 saved` : `${archivedCount}/30 archived`}
          </p>
        </div>
        <button
          onClick={() => {
            setSelectMode(!selectMode);
            setSelected(new Set());
          }}
          className={`flex items-center gap-2 px-3.5 h-10 rounded-xl border text-sm transition-all ${
            selectMode
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card text-primary hover:bg-primary/5"
          }`}
        >
          <CheckSquare size={16} />
          {selectMode ? "done" : "select"}
        </button>
      </div>

      <div className="flex gap-1 p-1 rounded-xl bg-muted mb-5 w-fit">
        <button
          onClick={() => setView("library")}
          className={`flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-semibold transition-colors ${
            view === "library" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          Library
        </button>
        <button
          onClick={() => setView("archived")}
          className={`flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-semibold transition-colors ${
            view === "archived" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          <Archive size={12} />
          Archived
        </button>
      </div>

      <div className="relative mb-5">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search rhythms..."
          className="w-full pl-11 pr-4 h-12 rounded-full border border-border bg-card text-[15px] outline-none placeholder:text-primary/50 focus:border-primary/60 transition-colors"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Music2 size={28} className="text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold mb-1">
            {query ? "No matches found" : view === "archived" ? "Archive is empty" : "No rhythms yet"}
          </p>
          <p className="text-xs text-muted-foreground max-w-[220px]">
            {query
              ? "Try a different search term"
              : view === "archived"
              ? "Deleted rhythms land here for 15 days before they're removed."
              : "Record your first rhythm from the Record tab"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((r, i) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.04, 0.3), ease: "easeOut" }}
            >
              <RhythmCard
                rhythm={r}
                onDelete={handleDelete}
                onPermanentDelete={handlePermanentDelete}
                onRestore={handleRestore}
                onRename={handleRename}
                onToggleLock={handleToggleLock}
                selectMode={selectMode}
                isSelected={selected.has(r.id)}
                onToggleSelect={toggleSelect}
              />
            </motion.div>
          ))}
        </div>
      )}

      {view === "archived" && archivedCount > 0 && (
        <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3 text-[11px] text-muted-foreground">
          Archived rhythms are removed automatically after 15 days. Lock a rhythm to prevent permanent deletion.
        </div>
      )}

      <AnimatePresence>
        {selectMode && selected.size > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-20 inset-x-0 flex justify-center px-5 z-30 no-print"
          >
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/95 backdrop-blur shadow-xl px-3 py-2.5">
              <span className="text-sm font-semibold">{selected.size} selected</span>
              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-1.5 px-3 h-9 rounded-xl bg-destructive text-destructive-foreground text-sm font-bold active:scale-95 transition-transform"
              >
                <Trash2 size={15} /> {view === "archived" ? "Delete" : "Archive"}
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
              >
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}