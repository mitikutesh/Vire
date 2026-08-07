/**
 * Every user-facing string in Vire.
 *
 * Components must not contain literal copy. Two reasons: the prototype's voice
 * is a product decision worth protecting from drift, and Finnish localization
 * (open question 6) then becomes a content task instead of a refactor.
 *
 * Copy is kept verbatim from vire-health-planner.jsx wherever the flow still
 * exists. Deliberate departures are marked PRODUCTION and explained — they are
 * places where the prototype apologised for a shim that now works for real.
 */

import { WATER } from './plan';

/** Slot labels and the rough time each one lands. */
export const SLOT_LABEL = {
  b: { label: 'Breakfast', hint: '≈ 7–9' },
  l: { label: 'Lunch', hint: '≈ 11:30–13' },
  s: { label: 'Afternoon snack', hint: '≈ 15' },
  d: { label: 'Dinner', hint: '≈ 17:30–19' },
  e: { label: 'Evening bite', hint: '≈ 20:30' },
} as const;

export const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export const t = {
  app: {
    wordmark: 'Vire',
    tagline: 'food · water · movement',
    settingsAria: 'Settings',
  },

  nav: {
    now: 'Now',
    today: 'Today',
    week: 'Week',
    shop: 'Shop',
  },

  auth: {
    signInTitle: 'Welcome back',
    signInSubtitle: 'Your week of healthy eating is waiting.',
    signUpTitle: 'Create your account',
    signUpSubtitle: 'A week of good food starts here.',
    emailLabel: 'Email',
    emailPlaceholder: 'you@example.com',
    passwordLabel: 'Password',
    // PRODUCTION: minimum raised from the prototype's 6 characters.
    passwordPlaceholder: 'At least 8 characters',
    signInAction: 'Sign in',
    signUpAction: 'Create account',
    or: 'or',
    google: 'Continue with Google',
    forgot: 'Forgot your password?',
    newHere: 'New here? ',
    haveAccount: 'Have an account? ',
    switchToSignUp: 'Create an account',
    switchToSignIn: 'Sign in',
    errors: {
      email: 'Enter a valid email address.',
      password: 'Password needs at least 8 characters.',
      noAccount: 'No account with that email — create one below.',
      wrongPassword: 'Wrong password — try again.',
      emailTaken: 'That email already has an account — sign in instead.',
      // PRODUCTION: registration is invite-only so strangers cannot spend the
      // household's AI budget (PLAN §2, decision 4).
      inviteOnly: 'This Vire is invite-only — ask the owner to add your email.',
      unverified: 'Check your inbox and confirm your email address first.',
      wrongCode: "That code doesn't match — check the email and try again.",
      expiredCode: 'That code has expired. Send a new one below.',
      rateLimited: 'Too many attempts. Wait a minute, then try again.',
      network: 'No connection. Check your network and try again.',
      generic: 'Something went wrong. Try again in a moment.',
    },

    // Confirmation step: Cognito emails a code before the account works.
    confirmTitle: 'Check your email',
    confirmSubtitle: (email: string) => `We sent a confirmation code to ${email}.`,
    codeLabel: 'Confirmation code',
    codePlaceholder: '6-digit code',
    confirmAction: 'Confirm my email',
    resendCode: 'Send a new code',
    backToSignIn: 'Back to sign in',

    // Password reset, in the same two steps.
    resetTitle: 'Reset your password',
    resetSubtitle: 'We’ll email you a code to set a new password.',
    resetRequestAction: 'Email me a code',
    newPasswordLabel: 'New password',
    resetConfirmAction: 'Set new password',
    // PRODUCTION: real flows, so the prototype's explanatory notes are gone.
    resetSent: 'Password reset sent — check your inbox.',
    verifySent: 'Confirmation email sent — check your inbox.',
  },

  settings: {
    firstRunTitle: 'Tell Vire about you',
    title: 'Settings',
    closeAria: 'Close settings',
    firstRunBlurb:
      "A minute of setup so the calorie budget and the week's food are actually yours.",

    youSection: 'You',
    name: 'Name',
    namePlaceholder: 'How should Vire greet you?',
    age: 'Age',
    height: 'Height (cm)',
    weight: 'Weight (kg)',
    goalWeight: 'Goal weight (kg)',
    sex: 'Sex',
    female: 'Female',
    male: 'Male',
    activity: 'Activity level (outside workouts)',
    activityLabels: ['Mostly sitting', 'Lightly active', 'Moderately active', 'Very active'],
    pace: 'Weight-loss pace',
    paceLabels: ['Gentle (≈ ¼ kg / week)', 'Steady (≈ ½ kg / week)', 'Faster (≈ ¾ kg / week)'],

    foodSection: 'Food & shopping',
    city: 'City',
    allergies: 'Allergies',
    allergiesPlaceholder: 'e.g. peanuts, shellfish',
    // Health guardrail 3 — must survive any rewrite (PLAN §7).
    allergiesNote:
      "Generated plans exclude these — but always double-check product labels; don't rely on this alone for severe allergies.",
    waterGoal: 'Water goal (ml)',

    targetFirstRun: 'Your daily target',
    targetChanged: 'New daily target',
    kcal: (n: number) => `${n} kcal`,
    onTheWay: (from: number, to: number) => `On the way from ${from} kg to ${to} kg.`,

    saveFirstRun: 'Save and continue',
    save: 'Save changes',

    planSection: 'Weekly plan',
    planBlurb: 'Regenerate if your goals changed or you want different meals.',
    regenerate: 'Generate my week plan',
    regenerateConfirm: 'Tap again to confirm',
    regenerateWarning: "This replaces the current week's meals and grocery list.",

    signOut: 'Sign out',

    // Health guardrail 2 — must survive any rewrite (PLAN §7).
    doctorNote:
      "The target uses the Mifflin-St Jeor estimate with a safe minimum. For the cholesterol side, it's worth sanity-checking your goals with your doctor.",

    // I1: weigh-ins feed the target so it cannot drift stale as weight drops.
    weighInSection: 'Weigh-in',
    weighInPrompt: 'Time for this week’s weigh-in?',
    weighInLabel: 'Weight today (kg)',
    weighInSave: 'Save weigh-in',
    weighInUpdateTarget: (n: number) => `Update my target to ${n} kcal`,
    weighInKeepTarget: 'Keep my current target',
  },

  planGate: {
    title: 'No plan for this week yet',
    blurb: (allergies: string | null) =>
      `In about 30 seconds you'll get 7 days of cholesterol-friendly meals${
        allergies ? ` (avoiding ${allergies})` : ''
      }, an exercise schedule and a full grocery list with links to Finnish store prices.`,
    generate: 'Generate my week plan',
    // Health guardrail 3: the starter plan is NOT allergy-adjusted, and says so
    // at both points it is offered (idle and error).
    starter: (hasAllergies: boolean) =>
      `or start with the built-in Finnish starter plan${
        hasAllergies ? ' (not adjusted for your allergies)' : ''
      }`,
    starterAfterError: (hasAllergies: boolean) =>
      `Use the starter plan instead${hasAllergies ? ' (not adjusted for your allergies)' : ''}`,
    generatingNote: 'Cooking up your week — the grocery list assembles itself right after.',
    error:
      "Some days didn't come back right — it happens. Try again, or start from the built-in plan.",
    retry: 'Try again',
  },

  now: {
    greeting: {
      quiet: 'Quiet hours',
      morning: 'Good morning',
      day: 'Good day',
      afternoon: 'Good afternoon',
      evening: 'Good evening',
    },
    header: (greeting: string, firstName: string, dayName: string, date: Date) =>
      `${greeting}${firstName ? `, ${firstName}` : ''} — ${dayName} ${date.getDate()}.${
        date.getMonth() + 1
      }.`,
    nightTitle: 'The day is done.',
    rightNow: (slotLabel: string) => `Right now: ${slotLabel.toLowerCase()}`,
    nightCardTitle: "Kitchen's closed — time to rest.",
    nightCardBody: 'Tomorrow’s breakfast:',
    nowChip: (hint: string) => `now · ${hint}`,
    markEaten: 'Mark as eaten',
    eaten: 'Eaten — nicely done',
    eatenSwapped: (kcal: number) => `Eaten — ${kcal} kcal logged`,
    moveNudge: (exercise: string, min: number) =>
      `Good window for today's ${exercise.toLowerCase()} — ${min} min.`,
    kcalLeft: 'kcal left',
    kcalOver: 'over',
    ofTarget: (target: number) => `of ${target}`,
    waterTile: 'tap to drink',
    exerciseDone: 'done ✓',
    exerciseMinutes: (min: number) => `${min} min`,
  },

  today: {
    title: "Today's plan",
    eatenBurned: (eaten: number, burned: number) => `Eaten ${eaten} · burned +${burned}`,
    remaining: (kcal: number) => `${kcal} kcal left`,
    over: (kcal: number) => `${kcal} kcal over`,

    movementLabel: 'Movement · ≈ 17:00',
    movementSummary: (name: string, min: number) => `${name} · ${min} min`,
    movementKcal: (kcal: number) => `≈ ${kcal} kcal`,
    markDone: 'Mark done',
    done: 'Done ✓',
    removeAria: 'Remove',

    waterGoal: (glasses: number) =>
      `Water — aim for ${glasses} glasses (≈ ${
        Math.round(glasses * (WATER.glassMl / 1000) * 10) / 10
      } L)`,
    waterLessAria: 'One less glass',
    waterMoreAria: 'One more glass',

    extraTitle: 'Ate something extra?',
    extraHelp:
      'Adds on top of the meals. To swap a whole meal, open it above and log what you ate instead.',
    extraWhat: 'What (optional)',
    extraKcal: 'kcal',
    extraAdd: 'Add',

    // Health guardrail 4 — must survive any rewrite (PLAN §7).
    disclaimer:
      'Nutrition values are estimates for one home-cooked portion; movement numbers are rough averages.',

    // I3: history navigation.
    prevDayAria: 'Previous day',
    nextDayAria: 'Next day',
    readOnly: 'Past day — logging is closed.',
    backToToday: 'Back to today',
  },

  week: {
    subtitle: 'The map of the week — tap a day to peek.',
    title: 'This week',
    todayBadge: 'today',
    move: 'Move',
    averageNote: (avg: number, starter: boolean) =>
      `Weekly average ≈ ${avg} kcal/day${
        starter ? ', from the built-in Finnish starter plan' : ', generated for your profile'
      } — fish, oats, rye, legumes and plenty of vegetables: the cholesterol-friendly core.`,
    // I1: weight trend lives here.
    weightTrendTitle: 'Weight',
    weightCurrentToGoal: (current: number, goal: number) => `${current} kg → ${goal} kg`,
    weightTrendCaption: 'Trend, not medical advice.',
    weightTrendEmpty: 'Log a weigh-in to start the trend.',
  },

  shop: {
    subtitle: 'Everything the week’s menu needs — for one person.',
    title: 'Groceries',

    areaLabel: 'Your area',
    nearCity: (chain: string, city: string) => `${chain} near ${city}`,
    dealsS: 'S-kaupat weekly deals',
    dealsK: 'K-Ruoka deals',
    dealsL: 'Lidl offers',

    offersTitle: "This week's offers",
    offersRefreshAria: 'Refresh offers',
    offersScanning:
      'Scanning s-kaupat, K-Ruoka and Lidl for current discounts — takes about 20 seconds…',
    offersRefreshing: 'Refreshing the offer scan…',
    offersError:
      "Couldn't fetch offers right now. Tap the arrow to retry, or use the deals links above.",
    offersFound: (n: number) => `${n} of your items`,
    offersFoundTail: ' look discounted right now. ',
    offersNone: 'No current offers matched your list. ',
    offersApply: (n: number) => `Tag ${n} item${n > 1 ? 's' : ''} to their discount store`,
    // Health guardrail 5: the scan is best-effort and must say so, with the
    // timestamp and a pointer to the authoritative price links.
    offersFooter: (checkedAt: string) =>
      `AI-searched from public offer pages · checked ${checkedAt} · verify with the S/K price links before you shop.`,

    basket: (checked: number, total: number) => `${checked} of ${total} in the basket`,
    reset: 'reset',
    filterAll: (n: number) => `All (${n})`,
    filterS: (n: number) => `S · ${n}`,
    filterK: (n: number) => `K · ${n}`,
    filterL: (n: number) => `Lidl · ${n}`,
    tagHint:
      'Tap the round tag on an item to assign it to a store chain (S → K → Lidl). Tap S / K links to check its live price.',
    staple: ' · pantry staple — skip if you have it',
    checkAria: 'Check',
    uncheckAria: 'Uncheck',
    assignStoreAria: 'Assign store',
    priceAtS: (name: string) => `Price at S-kaupat: ${name}`,
    priceAtK: (name: string) => `Price at K-Ruoka: ${name}`,
  },

  meal: {
    ingredients: 'Ingredients',
    howToMake: 'How to make it',
    watch: "Watch how it's made",
    detailsShow: 'Ingredients & how to make it',
    detailsHide: 'Hide',
    macroKcal: (kcal: number) => `${kcal} kcal`,
    macroProtein: (g: number) => `Protein ${g} g`,
    macroCarbs: (g: number) => `Carbs ${g} g`,
    macroFat: (g: number) => `Fat ${g} g`,
    swapPrompt: 'Ate something else? Log its calories →',
    swapWhat: 'What (optional)',
    swapKcal: 'kcal',
    swapLog: 'Log',
    swapLogged: (name: string, kcal: number, planned: number) => ({
      lead: 'Logged instead: ',
      name: name || 'something else',
      kcal: ` · ${kcal} kcal`,
      planned: ` (plan ${planned})`,
    }),
    swapRemoveAria: 'Remove logged food',
    eatenCheckboxAria: (slotLabel: string) => `Mark ${slotLabel.toLowerCase()} as eaten`,
  },

  loading: {
    splash: 'Vire',
  },
} as const;

export type Strings = typeof t;
