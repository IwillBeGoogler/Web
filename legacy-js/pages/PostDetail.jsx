import { useEffect, useState } from "react";
import { api } from "../api/client";
import { fmt } from "../utils/format";

export default function PostDetail({ id, back }) {
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [author, setAuthor] = useState("");
  const [text, setText] = useState("");

  useEffect(() => {
    api(`/posts/${id}`).then(setPost).catch(back);
    api(`/posts/${id}/comments`).then(setComments);
  }, [id]);

  const like = async () => setPost(await api(`/posts/${id}/like`, "POST"));

  const comment = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    const c = await api(`/posts/${id}/comments`, "POST", { author, text });
    setComments([...comments, c]);
    setText("");
  };

  if (!post) return <p className="muted">Loading...</p>;

  return (
    <article className="card">
      <button className="ghost" onClick={back}>← Back</button>
      <h2>{post.title}</h2>
      <small className="muted">
        {post.author} · {fmt(post.created_at)}
      </small>
      <div className="tags">{post.tags.map((t) => <span key={t} className="tag">#{t}</span>)}</div>
      <p className="body">{post.body}</p>
      <button onClick={like}>♥ {post.likes}</button>

      <h3>Comments ({comments.length})</h3>
      {comments.map((c) => (
        <div key={c.id} className="comment">
          <b>{c.author}</b> <small className="muted">{fmt(c.created_at)}</small>
          <p>{c.text}</p>
        </div>
      ))}
      <form onSubmit={comment}>
        <input placeholder="Your name" value={author} onChange={(e) => setAuthor(e.target.value)} />
        <textarea placeholder="Write a comment..." value={text} onChange={(e) => setText(e.target.value)} />
        <button>Comment</button>
      </form>
    </article>
  );
}
