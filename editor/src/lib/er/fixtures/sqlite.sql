PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS [artists] (
  ArtistId INTEGER PRIMARY KEY AUTOINCREMENT,
  Name TEXT NOT NULL
);
CREATE TABLE albums (
  AlbumId INTEGER PRIMARY KEY,
  Title TEXT NOT NULL,
  ArtistId INTEGER NOT NULL REFERENCES artists (ArtistId) ON DELETE CASCADE,
  -- trailing comment
  Price REAL DEFAULT 9.99,
  UNIQUE (Title, ArtistId)
) WITHOUT ROWID;
CREATE TABLE playlist_track (
  playlist_id INTEGER NOT NULL,
  track_id INTEGER NOT NULL,
  PRIMARY KEY (playlist_id, track_id),
  FOREIGN KEY (track_id) REFERENCES albums(AlbumId)
);
CREATE INDEX idx_album_title ON albums(Title);
