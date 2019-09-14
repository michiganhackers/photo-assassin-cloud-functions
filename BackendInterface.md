# Backend Interface
This document outlines the interface for Photo Assassin's backend &mdash; i.e.
how to use each cloud function.

## createGame
**Description**: Used to create a new game. The game will be in the `notStarted`
state after creation.

**Authentication**: Requires authentication as any valid user.

**Parameters**:

 - `name` - `String` - The name of the new game.
 - `invitedUsernames` - `[String]` - An array containing unique usernames for
    users who should be invited to the game initially. The array should not
    contain the username of the user who created the game.

**Implementation Status**: This function is partially implemented. Games can be
created, but the `invitedUsernames` parameter is ignored since usernames are
not yet implemented in the database.

## startGame
**Description**: Used to start an already-created game.

**Authentication**: Requires authentication as a valid user who is also
designated as the owner (i.e. creator) of the game to start.

**Parameters**:

 - `gameID` - `String` - The unique ID of the game to start. Can be obtained
    from the user's list of current lobbies, and corresponds to the document
    name for each entry within the global `games` collection. The game must:
     - Have a status of `notStarted`.
     - Have at least 3 players in the lobby.

**Implementation Status**: Fully implemented (in theory). Note that this
function is *not* fully tested.

## submitSnipe
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
that are too big or invalid. Does not handle invalid gameIDs well. *Not tested
at all*.

## leaveGame
**Description**: Used to leave a game that the user no longer wishes to
participate in. If the game is active and is left with fewer than 3 players, the
game will end.

**Authentication**: Requires authentication as a valid user who is a player
within the designated game.

**Parameters**:

  - `gameID` - `String` - The unique ID of the game to leave. The game must have
     a status of `notStarted` or `started` (it cannot be already `ended`).

**Implementation Status**: Not yet implemented.

## submitVote
**Description**: Used to submit a vote on whether a snipe was valid.

**Authentication**: Requires authentication as a valid user who is alive within
the designated game and has not yet voted on this snipe.

**Parameters**:

  - `gameID` - `String` - The unique ID of the game in which to vote.
  - `snipeID` - `String` - The unique ID of the snipe to vote on. The snipe must
     have a status of `voting`.
  - `vote` - `Boolean` - The actual vote. Should be `true` if the user thinks
     the picture is a valid snipe of the target, or `false` otherwise.

**Implementation Status**: Not yet implemented.

## invalidateSnipes
**Description**: Used to invalidate snipes that were submitted against a user
in the last *n* minutes, where *n* is a to-be-determined constant.

**Authentication**: Requires authentication as a valid user.

**Parameters**: None.

**Implementation Status**: Not yet implemented.
