# Backend Interface
This document outlines the interface for Photo Assassin's backend &mdash; i.e.
how to use each cloud function and what triggers exist.

## Functions

### addUser

**Description**: Used to add the data for a new user. The user must already be
authenticated for this to occur.

**Authentication**: Requires authentication as the given user.

**Parameters**:

 - `displayName` - `String` - The user's display name.
 - `username` - `String` - The user's username. Must be unique (case insensitive). Automatically converts all characters to lowercase.

**Returns**:

 - `errorCode` - `String` - `"ok"` if user is successfully created. `"duplicateUsername"` if username already exists.

**Implementation Status**: This function is fully implemented.

### createGame
**Description**: Used to create a new game. The game will be in the `notStarted`
state after creation.

**Authentication**: Requires authentication as any valid user.

**Parameters**:

 - `maxPlayers` - `Number` - The maximum number of players to have in the game.
   Must be at least 3.
 - `name` - `String` - The name of the new game.
 - `invitedUsernames` - `[String]` - An array containing unique usernames for
    users who should be invited to the game initially. The array should not
    contain the username of the user who created the game.

**Returns**:

 - `gameID` - `String` - The id of the game created.

**Implementation Status**: This function is partially implemented. Games can be
created, but the `invitedUsernames` parameter is ignored since usernames are
not yet implemented in the database.

### startGame
**Description**: Used to start an already-created game.

**Authentication**: Requires authentication as a valid user who is also
designated as the owner (i.e. creator) of the game to start.

**Parameters**:

 - `gameID` - `String` - The unique ID of the game to start. Can be obtained
    from the user's list of current lobbies, and corresponds to the document
    name for each entry within the global `games` collection. The game must:
     - Have a status of `notStarted`.
     - Have at least 3 players in the lobby.

**Implementation Status**: Fully implemented.

### submitSnipe
**Description**: Used to submit a snipe (i.e. picture of target(s)) to one or
more current games for consideration.

**Authentication**: Requires authentication as a valid user who is also alive
within the designated game(s).

**Parameters**:

 - `gameIDs` - `[String]` - An array of unique IDs of games to submit the snipe
    to. The authenticated user must be alive within all of the games. Each game
    must have a status of `started`.
 - `base64JPEG` - `String` - A Base64-encoded representation of the JPEG image
    for the snipe. Should **not** contain `data:image/jpeg;base64,` like a data
    URI would.

**Implementation Status**: Implemented naively. Does not yet account for images
that are too big or invalid.
**Returns**:

 - `pictureID` - `String` - The pictureID of the snipe submitted.

### leaveGame
**Description**: Used to leave a game that the user no longer wishes to
participate in. If the game is active and is left with fewer than 3 players, the
game will end.

**Authentication**: Requires authentication as a valid user who is a player
within the designated game.

**Parameters**:

  - `gameID` - `String` - The unique ID of the game to leave. The game must have
     a status of `notStarted` or `started` (it cannot be already `ended`).

**Implementation Status**: Partially implemented. Currently does not account
for the case where the game is already started.

### submitVote
**Description**: Used to submit a vote on whether a snipe was valid.

**Authentication**: Requires authentication as a valid user who is alive within
the designated game and has not yet voted on this snipe.

**Parameters**:

  - `gameID` - `String` - The unique ID of the game in which to vote.
  - `snipeID` - `String` - The unique ID of the snipe to vote on. The snipe must
     have a status of `voting`.
  - `vote` - `Boolean` - The actual vote. Should be `true` if the user thinks
     the picture is a valid snipe of the target, or `false` otherwise.

**Implementation Status**: Implemented, not yet tested.

### invalidateSnipes
**Description**: Used to invalidate snipes that were submitted against a user
in the last *n* minutes, where *n* is a to-be-determined constant.

**Authentication**: Requires authentication as a valid user.

**Parameters**: None.

**Implementation Status**: Not yet implemented.

### addFriend
**Description**: Used to add a new friend to the currently logged in user.

**Authentication**: Requires authentication as any valid user.

**Parameters**: `friendToAddId` - `Number` - The user id of the friend to add.

**Implementation Status**: This function is fully implemented. Note: Future versions of the app might use a "request/accept friend" model, requiring the use of a different cloud function.

### removeFriend
**Description**: Used to remove a friend from the currently logged in user.

**Authentication**: Requires authentication as any valid user.

**Parameters**: `friendToRemoveId` - `Number` - The user id of the friend to remove.

**Implementation Status**: This function is fully implemented.


### updateDisplayName
**Description**: Used to update the `displayName` field of the currently logged in user.

**Authentication**: Requires authentication as any valid user.

**Parameters**: `displayName` - `String` - The new display name.

**Implementation Status**: This function is partially implemented.

### updateFirebaseInstanceIds
**Description**: Used to update the `firebaseInstanceIds` field of the currently logged in user. Note that it is allowed for a user to be logged in on multiple devices and/or use the same device to log into multiple accounts.

**Authentication**: Requires authentication as any valid user.

**Parameters**:

  - `firebaseInstanceId` - `String` - The instance id that will be added or removed
  - `operation` - `String` - Must be either `"add"` or `"remove"`.  
  If the value is `"add"`, the given `firebaseInstanceId` will be appended to the `firebaseInstanceIds` field of the currently logged in user. This should be done when the user logs in and when the instance ID is refreshed.  
  If the value is `"remove"`, the given `firebaseInstanceId` will be removed from the `firebaseInstanceIds` field of the currently logged in user. This should be done when the user logs out.

**Implementation Status**: This function is fully implemented, but subject to change. It might be disallowed for users to be logged in on multiple devices at the same time in the future.


## Triggers

### storageProfilePicOnFinalize
**Description**: Automatically updates the `profilePicUrl` field of a user when an image is uploaded to `/images/profile_pictures/{uid}`.

**Authentication**: Requires authentication as a valid user whose user id matches the uid in the filepath `/images/profile_pictures/{uid}`.

**Parameters**: None.

**Implementation Status**: This trigger is fully implemented.
