Here is the complete list of query parameters you can pass to the game URL (e.g. inside your app's WebView or iframe):

### 📋 **List of URL Query Parameters**

| Parameter | Type | Description | Example |
| :--- | :--- | :--- | :--- |
| **`roomId`** | `string` | Unique room identifier for the match. Both players must join the same `roomId`. | `room_abc123` |
| **`playerId`** | `string` | Unique ID of the current player. | `usr_1001` |
| **`playerName`** | `string` | Display name of the current player. | `Ali` |
| **`playerAvatar`** | `string` | **[NEW]** Direct URL to the current player's profile picture. | `https://example.com/avatars/ali.png` |
| **`opponentId`** | `string` *(optional)* | ID of the opponent (if known prior to match start). | `usr_1002` |
| **`opponentName`** | `string` *(optional)* | Display name of the opponent (if known). | `Sara` |
| **`opponentAvatar`**| `string` *(optional)* | Avatar URL of the opponent (if known). | `https://example.com/avatars/sara.png` |
| **`betAmount`** | `number` *(optional)* | Match entry fee / coin amount. | `500` |
| **`tableSkin`** | `string` *(optional)* | Table cloth skin (`classic`, `blue`, etc.). | `classic` |
| **`ballSet`** | `string` *(optional)* | Ball texture set (`classic`, `neon`). | `classic` |
| **`wsUrl`** | `string` *(optional)* | Custom WebSocket domain override (if different from window host). | `game-server.com` |

---

### 🌐 **Example URL**

```text
https://game.yourdomain.com/?roomId=room_8ball_99&playerId=user_777&playerName=Ali&playerAvatar=https://api.porteghal.app/avatars/ali.png&betAmount=1000&tableSkin=classic
```

### 💡 **How it Works:**
1. When Player 1 opens the URL with `playerAvatar`, the game parses it and sends it to the server in `join_room`.
2. The server stores both players' avatars in Redis and sends Player 1's avatar to Player 2 (and vice-versa).
3. The HUD automatically renders the profile pictures inside a circular frame on the top scoreboard header. If an avatar URL is missing or fails to load, it cleanly falls back to an avatar with the player's initial letter!
