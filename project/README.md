# Project Report

## The game: Wumpus World
The Wumpus World is a simple grid-based game where the player must navigate through a cave to 
find gold while avoiding pits and a monster hiding in a cell, called the Wumpus.\
The player receives sensory information about their surroundings, such as:
* breezes near pits (in the four adjacent cells of a pit)
* stench near the Wumpus (in the four adjacent cells of the Wumpus)
* glitter near gold (in the same cell as the gold)
* bump when trying to move into a wall (when trying to move outside the grid)
* scream sound when the Wumpus is killed (when shooting an arrow into the cell with the Wumpus)

And she/he must use this information to make informed decisions about what to do next.\
Player's actions include:
* moving in one of the four cardinal directions (north, south, east, west)
* shooting her/his only arrow in one of the four directions (to kill the Wumpus)
* grabbing the gold (when in the same cell as the gold)
* climbing out of the cave (when in the starting cell)

The player wins the game by grabbing the gold and climbing out of the cave, and loses the game by falling into a pit or being killed by the Wumpus.

The nature of sensory/action loop in the Wumpus World makes it a suitable problem for to be done by a dialogue system.

## Technicalities
* The same `typescript` codebase (from labs) was used to implement the game logic and state machine.
* A similar `CLU`-based dialogue system (from labs) was used to implement the conversational features of the game.
* `Vite` was used to set up the project and build the frontend.
* `wrangler` to deploy the project to `cloudflare pages`.

## Challenges
* The state machine for the game was different from the ones we had in the lab.
* The initiation of the game was a totally new experience for me (e.g. randomizing the location of the Wumpus, pits, and gold).
* The conversational features of the game were also a new experience for me.
    * For example, deciding what level of concepts to be used as intent and entities.
    * I re-implemented the dialogue system several times to find a suitable design for the game.

## Relation to course contents
* Labs 3, 4, and 5 were very helpful in implementing the game logic and state machine.
* Lab 5's CLU was very helpful to make the dialogue system flexible and more natural for the players.
* `statecharts` was a perfect framework for this game logic, since the game mechanics are following a state machine.
* I tried to use the feedback from the labs to make the game more user-friendly and engaging.

## Future work
* The game can be extended by:
    * adding more levels, with bigger maps, more than one pit and wumpus.
    * adding more natural sensory information (e.g. sound of the Wumpus/breeze/glitter of the gold).
    * adding a multiplayer mode where players can compete or cooperate to find the gold.

## Deployment
The game is deployed on `cloudflare pages` and can be accessed at:\
https://dialogue-systems-1-2026.pages.dev \
Click `Start Game` and play!

## Demonstration
Here is a recording of me playing the game: [demo.mp3](./demo.mp3)


