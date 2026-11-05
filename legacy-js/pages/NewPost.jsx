import { useEffect, useState } from "react";
import { api } from "../api/client";
import { toTags } from "../utils/format";

export default function NewPost({ onCreated, onCancel }) {
  const [cats, setCats] = useState([]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(0);
  const [tags, setTags] = useState("");
  const [body, setBody] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    api("/categories").then(setCats);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!category) return setErr("Choose a category");
    try {
      const p = await api("/me/posts", "POST", { title, body, category_id: Number(category), tags: toTags(tags) });
      onCreated(p);
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>New post</h2>
      <select value={category} onChange={(e) => setCategory(e.target.value)}>
        <option value={0}>Choose category…</option>
        {cats.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input placeholder="Tags (comma separated)" value={tags} onChange={(e) => setTags(e.target.value)} />
      <textarea placeholder="Write something..." value={body} onChange={(e) => setBody(e.target.value)} />
      {err && <small className="error">{err}</small>}
      <div className="actions">
        <button>Publish</button>
        <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
