import type { Component } from 'vue'
import {
  PhBarbell, PhBed, PhBicycle, PhBookOpen, PhBowlFood, PhBrain, PhCheckSquare, PhCoffee, PhCookie,
  PhDrop, PhFire, PhFlame, PhFootprints, PhForkKnife, PhHeartbeat, PhLeaf, PhLightning, PhMoon,
  PhMountains, PhMusicNotes, PhPencilSimple, PhPersonSimpleBike, PhPersonSimpleRun, PhPersonSimpleSwim,
  PhPersonSimpleWalk, PhPill, PhPlant, PhPulse, PhScales, PhSneaker, PhSparkle, PhSun, PhSunHorizon,
  PhSwimmingPool, PhTarget, PhTimer, PhTrophy, PhUsersThree, PhWind, PhYinYang, PhCalendarCheck, PhClock,
  PhCloudSun, PhHandsPraying, PhHeart, PhMedal, PhStar, PhTree,
} from '@phosphor-icons/vue'

/** Curated Phosphor icons for tasks and groups; the full library would bloat the bundle. */
export const ICONS: Record<string, Component> = {
  Barbell: PhBarbell, Bed: PhBed, Bicycle: PhBicycle, BookOpen: PhBookOpen, BowlFood: PhBowlFood, Brain: PhBrain,
  CalendarCheck: PhCalendarCheck, CheckSquare: PhCheckSquare, Clock: PhClock, CloudSun: PhCloudSun, Coffee: PhCoffee,
  Cookie: PhCookie, Drop: PhDrop, Fire: PhFire, Flame: PhFlame, Footprints: PhFootprints, ForkKnife: PhForkKnife,
  HandsPraying: PhHandsPraying, Heart: PhHeart, Heartbeat: PhHeartbeat, Leaf: PhLeaf, Lightning: PhLightning,
  Medal: PhMedal, Moon: PhMoon, Mountains: PhMountains, MusicNotes: PhMusicNotes, PencilSimple: PhPencilSimple,
  PersonSimpleBike: PhPersonSimpleBike, PersonSimpleRun: PhPersonSimpleRun, PersonSimpleSwim: PhPersonSimpleSwim,
  PersonSimpleWalk: PhPersonSimpleWalk, Pill: PhPill, Plant: PhPlant, Pulse: PhPulse, Scales: PhScales,
  Sneaker: PhSneaker, Sparkle: PhSparkle, Star: PhStar, Sun: PhSun, SunHorizon: PhSunHorizon,
  SwimmingPool: PhSwimmingPool, Target: PhTarget, Timer: PhTimer, Tree: PhTree, Trophy: PhTrophy,
  UsersThree: PhUsersThree, Wind: PhWind, YinYang: PhYinYang,
}

export const ICON_NAMES = Object.keys(ICONS)

export function iconFor(name: string | null | undefined): Component {
  return (name && ICONS[name]) || PhCheckSquare
}
