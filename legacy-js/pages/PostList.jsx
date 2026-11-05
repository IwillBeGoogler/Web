import { useEffect, useState } from "react";
import { api } from "../api/client";
import { fmt } from "../utils/format";

export default function PostList({ open }) {
  const [posts, setPosts] = useState([]);
  const [tags, setTags] = useState([]);
  const [cats, setCats] = useState([]);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [cat, setCat] = useState(0);

  useEffect(() => {
    api("/tags").then(setTags);
    api("/categories").then(setCats);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (tag) params.set("tag", tag);
    if (cat && !q && !tag) api(`/categories/${cat}/posts`).then(setPosts);
    else {
      if (cat) params.set("category", cat);
      api("/posts?" + params).then(setPosts);
    }
  }, [q, tag, cat]);

  const catName = (id) => cats.find((c) => c.id === id)?.name;

  return (
    <>
      <input placeholder="Search..." value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="tags">
        <button className={cat === 0 ? "cat active" : "cat"} onClick={() => setCat(0)}>All categories</button>
        {cats.map((c) => (
          <button key={c.id} className={cat === c.id ? "cat active" : "cat"} onClick={() => setCat(c.id)}>
            {c.name} ({c.count})
          </button>
        ))}
      </div>
      <div className="tags">
        <button className={tag === "" ? "tag active" : "tag"} onClick={() => setTag("")}>all</button>
        {tags.map((t) => (
          <button key={t.name} className={tag === t.name ? "tag active" : "tag"} onClick={() => setTag(t.name)}>
            #{t.name} ({t.count})
          </button>
        ))}
      </div>
      {posts.length === 0 && <p className="muted">No posts yet.</p>}
      {posts.map((p) => (
        <article key={p.id} className="card clickable" onClick={() => open(p.id)}>
          <h2>{p.title}</h2>
          <small className="muted">
            {catName(p.category_id) && <span className="cat">{catName(p.category_id)}</span>} {p.author} ·{" "}
            {fmt(p.created_at)} · ♥ {p.likes}
          </small>
          <p>{p.body.length > 160 ? p.body.slice(0, 160) + "…" : p.body}</p>
          <div className="tags">{p.tags.map((t) => <span key={t} className="tag">#{t}</span>)}</div>
        </article>
      ))}
    </>
  );
}
