/**
 * The three mazes Messy Maze is raced in, drawn out.
 *
 * Fixed rather than generated each race, so every one of them has been looked
 * at and every one of them is tested for the thing that matters: **there is no
 * way from any corner to the middle that does not cross two different spinning
 * platforms.** A racer does not have to be told to use them; the walls see to
 * it.
 *
 * Each is 17 cells a side, drawn 35 characters square:
 *
 * - `#` a wall. Every other character on an even row and column is a corner
 *   post and is always `#`.
 * - `S` a starting corner, `X` the middle, `O` a spinning platform.
 * - a space: open floor, or a gap between two cells you can walk through.
 *
 * **Every maze is the same quarter turned four times**, so each corner looks
 * out on the same maze as every other. They were carved that way - a random
 * maze for one quarter, rotated - and then kept only if every route crossed
 * two platforms; `maze.test.ts` checks both properties of the drawings as they
 * stand, so editing one by hand is safe as long as the tests still pass.
 */

export interface Layout {
  name: string
  /** One line for the review notes: what this one is like to race. */
  blurb: string
  rows: readonly string[]
}

export const LAYOUTS: readonly Layout[] = Object.freeze([
  {
    name: 'The Long Way',
    blurb:
      'One long winding route per corner, with its two platforms far apart: the first a third of the way in, the second most of the way to the middle.',
    rows: [
      '###################################',
      '#S#     #  O  # #         #      S#',
      '# # # # # # # # # ####### # ### ###',
      '#     # # #   # #   # #   #   #   #',
      '# ### # # # ### ### # # # ### # # #',
      '# #   # # # #   # #O# #     #     #',
      '# # ### # # # ### # # # ######### #',
      '#   # #   # #       # #   #       #',
      '##### ##### ### # # # ### # #######',
      '#     #     #     #     # #       #',
      '# # # # ##### # # ### # # ####### #',
      '# #     #         #     #        O#',
      '# ####### # ### # # # # ####### # #',
      '# #             #   # #   #   #   #',
      '# ####### # ##### ### # # # # #####',
      '# #  O    #   # #   #       #     #',
      '# # ### ##### # # ##### # # #######',
      '#   #            X            #   #',
      '####### # # ##### # # ##### ### # #',
      '#     #       #   # #   #    O  # #',
      '##### # # # # ### ##### # ####### #',
      '#   #   #   # #   #             # #',
      '# # ####### # # # # ### # ####### #',
      '#O        #     #         #     # #',
      '# ####### # # ### # # ##### # # # #',
      '#       # #     #     #     #     #',
      '####### # ### # # # ### ##### #####',
      '#       #   # #       # #   # #   #',
      '# ######### # # # ### # # # ### # #',
      '#     #     # #O# #   # # # #   # #',
      '# # # ### # # # ### ### # # # ### #',
      '#   #   #   # #   # #   # # #     #',
      '### ### # ####### # # # # # # # # #',
      '#S      #         # #  O  #     #S#',
      '###################################',
    ],
  },
  {
    name: 'Switchbacks',
    blurb:
      'Corridors that double back on themselves and plenty of dead ends to take a wrong turn into, with the platforms spread evenly along the way.',
    rows: [
      '###################################',
      '#S#             #     #       #  S#',
      '# ### ### # # ### # ### # # # # ###',
      '#   #     #     # #   #     #   # #',
      '### ##### ##### # ### # # # ##### #',
      '#   #     #     # # # #     # #   #',
      '# ##### ### ### # # # # ##### # # #',
      '#     #   #O#   #   #  O# #   # # #',
      '# # # ### # # # ### ##### # # # # #',
      '#     #   # # #   #     #   #     #',
      '# # # ##### # # # ##### ######### #',
      '#      O#   # # #     #    O  #   #',
      '####### # ### # # # ######### # # #',
      '# #     # # # #   #         # #   #',
      '# # ##### # # # # # ####### # # # #',
      '#   #     #                     # #',
      '# ##### ### ### # # # ### #########',
      '#       #        X        #       #',
      '######### ### # # # ### ### ##### #',
      '# #                     #     #   #',
      '# # # # ####### # # # # # ##### # #',
      '#   # #         #   # # # #     # #',
      '# # # ######### # # # ### # #######',
      '#   #  O    #     # # #   #O      #',
      '# ######### ##### # # # ##### # # #',
      '#     #   #     #   # # #   #     #',
      '# # # # # ##### ### # # # ### # # #',
      '# # #   # #O  #   #   #O#   #     #',
      '# # # ##### # # # # ### ### ##### #',
      '#   # #     # # # #     #     #   #',
      '# ##### # # # ### # ##### ##### ###',
      '# #   #     #   # #     #     #   #',
      '### # # # # ### # ### # # ### ### #',
      '#S  #       #     #             #S#',
      '###################################',
    ],
  },
  {
    name: 'Tangle',
    blurb:
      'The loopiest of the three, with the most ways between quarters: shorter to the middle, but more chances to wander into another quarter and use the platforms there.',
    rows: [
      '###################################',
      '#S  #   # #     #               #S#',
      '### # # # # # ### ######### # ### #',
      '# # #   #   #   # #       #       #',
      '# # # # ### ### # ### # # #########',
      '#   #     # #   #   # #           #',
      '# # # # # ### # ### ### # # # # # #',
      '#   #   #   #     #O              #',
      '# ### # # # # # # ########### #####',
      '# #     #O  # #       #  O    #   #',
      '# # # # # ### # # # ### # # ### ###',
      '# #     #   #     #     #   #     #',
      '# # ### ### ### # # # ########### #',
      '# #   # # #     #   # #       #   #',
      '# # ### # # ### # # # # ### # # # #',
      '# # #  O#         #             # #',
      '# ### ### ### ### # ### # # #######',
      '#     #          X          #     #',
      '####### # # ### # ### ### ### ### #',
      '# #             #         #O  # # #',
      '# # # # ### # # # # ### # # ### # #',
      '#   #       # #   #     # # #   # #',
      '# ########### # # # ### ### ### # #',
      '#     #   #     #     #   #     # #',
      '### ### # # ### # # # ### # # # # #',
      '#   #    O  #       # #  O#     # #',
      '##### ########### # # # # # # ### #',
      '#              O#     #   #   #   #',
      '# # # # # # ### ### # ### # # # # #',
      '#           # #   #   # #     #   #',
      '######### # # ### # ### ### # # # #',
      '#       #       # #   #   #   # # #',
      '# ### # ######### ### # # # # # ###',
      '#S#               #     # #   #  S#',
      '###################################',
    ],
  },
])
