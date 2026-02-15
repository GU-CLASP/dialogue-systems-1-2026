---
geometry: margin=1in
---
# Task 3. Improvements

 * First things first, after writting the first version of my code I noticed 3 major things that could be improved.
 1. Whatever question I was asking, all answers included in the grammar was valid. This means I could be asking, who are you meeting with, user says "monday" and it was perceived as a valid answer. What I did to fix that, was that I realized that I was only checking if something was in the grammar, even though I had already written explicit functions to get name, day, or time. So I stopped using the isingrammar function completely, and I just checked through the explicit get'something' functions if what I am trying to get is defined or not. 
 2. Another thing I noticed was that the things that I needed to say was extremely specific. The names for example, I had to say Andrew to get myself, anything else was incorrect. So I added some more entries pointing to the same person. It doesn't totally fix the problem but it does add some more flecibility. (like in the yes or no part, being able to say other things other than just yes or no)
 3. In continuation of the second thing, except of not having many valid entries, I had a hard time making it understand what name I was even saying.. Most of the times it couldn't hear and/or was predicting one wrong letter in the name, so it couldn't match it to anything. Example: Bartiokas instead of Bartsiokas. I didn't really try to fix this because I had a little sneak peak into lab4 and if I am not mistaken, we are taking care of this problem, or something like that.
