import { useEffect, useState } from "react";
import { api } from "../api/client";
import { fmt } from "../utils/format";

export default function MyPosts({ open }) {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    api("/me/posts").then(setPosts);
  }, []);

  return (
    <>
      <h2>My posts</h2>
      {posts.length === 0 && <p className="muted">You have no posts yet.</p>}
      {posts.map((p) => (
        <article key={p.id} className="card clickable" onClick={() => open(p.id)}>
          <h3>{p.title}</h3>
          <small className="muted">
            {fmt(p.created_at)} · ♥ {p.likes}
          </small>
        </article>
      ))}
    </>
  );
}
