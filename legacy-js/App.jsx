import { useEffect, useState } from "react";
import { api, getToken, setToken } from "./api/client";
import AuthPage from "./pages/AuthPage.jsx";
import MyPosts from "./pages/MyPosts.jsx";
import NewPost from "./pages/NewPost.jsx";
import PostDetail from "./pages/PostDetail.jsx";
import PostList from "./pages/PostList.jsx";

export default function App() {
  const [view, setView] = useState({ name: "list" });
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (getToken())
      api("/auth/me")
        .then(setUser)
        .catch(() => setToken(null));
  }, []);

  const go = (name, extra) => setView({ name, ...extra });
  const open = (id) => go("post", { id });
  const logout = () => {
    setToken(null);
    setUser(null);
    go("list");
  };

  return (
    <main>
      <header>
        <h1 onClick={() => go("list")}>My Blog</h1>
        <nav>
          {user ? (
            <>
              <span className="muted">@{user.username}</span>
              <button onClick={() => go("new")}>+ Write</button>
              <button className="ghost" onClick={() => go("mine")}>My posts</button>
              <button className="ghost" onClick={logout}>Log out</button>
            </>
          ) : (
            <button onClick={() => go("auth")}>Log in</button>
          )}
        </nav>
      </header>
      {view.name === "list" && <PostList open={open} />}
      {view.name === "post" && <PostDetail id={view.id} back={() => go("list")} />}
      {view.name === "auth" && (
        <AuthPage
          onAuth={(u) => {
            setUser(u);
            go("list");
          }}
        />
      )}
      {view.name === "new" && user && <NewPost onCreated={(p) => open(p.id)} onCancel={() => go("list")} />}
      {view.name === "mine" && user && <MyPosts open={open} />}
    </main>
  );
}
