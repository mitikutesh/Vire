import React, { useState, useEffect, useRef } from "react";
import {
  Settings, Droplets, ChevronDown, ExternalLink, Check, Plus, Minus,
  MapPin, ShoppingBasket, CalendarDays, Clock, Youtube, X, Sun, Moon,
  Footprints, Flame, RotateCcw, Percent, Loader2, Sprout, Sparkles, LogOut
} from "lucide-react";

/* ─────────────────────────── design tokens ─────────────────────────── */
const C = {
  paper: "#F1F2ED",   // birch white
  card: "#FFFFFF",
  ink: "#14342B",     // deep spruce
  sub: "#5F6E66",
  line: "#DFE4DC",
  pine: "#226B4F",    // RETIRED — no green accent (user preference)
  pineSoft: "#E4EFE8", // RETIRED
  cloud: "#DD8F1F",   // "now" energy (cloudberry)
  cloudSoft: "#FAF0DC",
  lake: "#3E7FA5",    // water only
  lakeSoft: "#E3EEF5",
  berry: "#B5484D",   // over budget / errors
  berrySoft: "#F6E4E4",
};

const STORE_STYLE = {
  S: { bg: "#E3F0E0", fg: "#2E7D32", label: "S" },
  K: { bg: "#FBE9DC", fg: "#D35400", label: "K" },
  L: { bg: "#E1EAF6", fg: "#1A5FA8", label: "L" },
};

/* ─────────────────────────── plan structure ─────────────────────────── */
const SLOTS = ["b", "l", "s", "d", "e"];
const SLOT_META = {
  b: { label: "Breakfast", hint: "≈ 7–9" },
  l: { label: "Lunch", hint: "≈ 11:30–13" },
  s: { label: "Afternoon snack", hint: "≈ 15" },
  d: { label: "Dinner", hint: "≈ 17:30–19" },
  e: { label: "Evening bite", hint: "≈ 20:30" },
};

/* Built-in starter plan (also the fallback if generation fails). wd 0 = Monday. */
const STARTER = [
  { /* Monday */
    b: { n: "Blueberry oatmeal", fi: "Kaurapuuro mustikoilla", k: 350, p: 12, c: 52, f: 11,
      ing: ["80 g rolled oats", "2 dl milk or oat drink + 1 dl water", "75 g blueberries (frozen is fine)", "15 g walnuts, chopped", "pinch of cinnamon & salt"],
      st: ["Bring oats and liquid to a gentle simmer, stirring.", "Cook 5–7 min until creamy; season with salt and cinnamon.", "Top with blueberries and walnuts."],
      yt: "creamy oatmeal porridge blueberries" },
    l: { n: "Light salmon soup", fi: "Lohikeitto", k: 480, p: 32, c: 42, f: 19,
      ing: ["120 g salmon fillet, cubed", "200 g potatoes, diced", "1 carrot, sliced", "½ leek, sliced", "0.5 dl oat cooking cream", "fish stock cube + 5 dl water", "plenty of fresh dill", "1 slice rye bread on the side"],
      st: ["Simmer potatoes, carrot and leek in the stock ~10 min.", "Add salmon and cook gently 5 min — don't let it boil hard.", "Stir in oat cream and dill; serve with rye bread."],
      yt: "lohikeitto finnish salmon soup recipe" },
    s: { n: "Apple + almonds", k: 180, p: 4, c: 22, f: 9, ing: ["1 apple", "15 g almonds"] },
    d: { n: "Chicken & root vegetable tray bake", k: 520, p: 38, c: 45, f: 18,
      ing: ["150 g chicken breast", "200 g potatoes, in wedges", "2 carrots, in chunks", "1 red onion, in wedges", "1 tbsp rapeseed oil", "dried herbs, salt, pepper"],
      st: ["Heat oven to 200 °C; toss everything with oil and seasoning.", "Spread on a tray and roast 30–35 min until the chicken is cooked through.", "Rest 5 min, then plate."],
      yt: "chicken vegetable tray bake healthy" },
    e: { n: "Skyr with berries", k: 120, p: 15, c: 12, f: 1, ing: ["150 g skyr or quark", "50 g berries"] },
  },
  { /* Tuesday */
    b: { n: "Rye bread with egg & vegetables", fi: "Ruisleipä + kananmuna", k: 340, p: 17, c: 38, f: 12,
      ing: ["2 slices rye bread", "1 boiled egg", "thin layer of plant-based spread", "tomato & cucumber slices"],
      st: ["Boil the egg 8–9 min; cool and slice.", "Spread the bread thinly; layer egg and vegetables.", "Finish with black pepper."],
      yt: "rye bread open sandwich egg" },
    l: { n: "Red lentil & tomato soup", k: 430, p: 20, c: 62, f: 9,
      ing: ["80 g red lentils, rinsed", "200 g crushed tomatoes", "1 onion + 1 garlic clove, chopped", "1 carrot, grated", "1 tsp ground cumin", "vegetable stock cube + 5 dl water", "1 wholegrain roll"],
      st: ["Soften onion, garlic and carrot in a splash of oil.", "Add lentils, tomatoes, stock and cumin; simmer 15 min.", "Blend roughly if you like; serve with the roll."],
      yt: "red lentil tomato soup easy" },
    s: { n: "Skyr + berries", k: 150, p: 16, c: 16, f: 1, ing: ["150 g skyr", "75 g berries"] },
    d: { n: "Oven-baked salmon & vegetables", fi: "Uunilohi", k: 560, p: 36, c: 38, f: 26,
      ing: ["140 g salmon fillet", "150 g potatoes", "150 g broccoli", "½ lemon", "1 tbsp rapeseed oil", "salt, pepper, dill"],
      st: ["Heat oven to 200 °C; give the potatoes a 15 min head start.", "Add salmon and broccoli; drizzle with oil and lemon.", "Roast 15 min more until the salmon flakes; finish with dill."],
      yt: "uunilohi oven baked salmon" },
    e: { n: "Rye crisps + cottage cheese", k: 130, p: 12, c: 14, f: 3, ing: ["2 rye crispbreads", "50 g cottage cheese"] },
  },
  { /* Wednesday */
    b: { n: "Apple-cinnamon overnight oats", k: 360, p: 14, c: 54, f: 10,
      ing: ["70 g rolled oats", "150 g plain yogurt", "0.5 dl milk", "½ apple, grated (rest for topping)", "1 tsp ground flaxseed", "cinnamon"],
      st: ["Mix everything the evening before.", "Refrigerate overnight.", "Top with the rest of the apple in the morning."],
      yt: "overnight oats apple cinnamon" },
    l: { n: "Chicken & quinoa bowl", k: 500, p: 36, c: 48, f: 16,
      ing: ["130 g chicken breast", "70 g quinoa (dry)", "tomato & cucumber, diced", "50 g plain yogurt + garlic + lemon", "1 tsp olive oil", "paprika powder"],
      st: ["Cook quinoa per the pack; pan-fry the seasoned chicken.", "Stir garlic and lemon into the yogurt.", "Bowl it up: quinoa, chicken, vegetables, sauce on top."],
      yt: "chicken quinoa bowl yogurt sauce" },
    s: { n: "Carrot sticks + hummus", k: 160, p: 5, c: 16, f: 8, ing: ["2 carrots", "50 g hummus"] },
    d: { n: "Wholegrain pasta with tuna & olives", k: 520, p: 32, c: 62, f: 14,
      ing: ["80 g wholegrain pasta (dry)", "1 can tuna in water, drained", "150 g crushed tomatoes", "1 garlic clove", "20 g olives, sliced", "2 handfuls spinach"],
      st: ["Boil the pasta; save a splash of pasta water.", "Simmer garlic, tomatoes and olives 5 min; fold in tuna and spinach.", "Toss with the pasta, loosening with pasta water."],
      yt: "tuna tomato pasta healthy" },
    e: { n: "A piece of fruit", k: 80, p: 1, c: 20, f: 0, ing: ["1 pear or orange"] },
  },
  { /* Thursday */
    b: { n: "Skyr & muesli bowl", k: 340, p: 22, c: 44, f: 7,
      ing: ["200 g skyr", "40 g unsweetened muesli", "75 g berries"],
      st: ["Layer skyr, muesli and berries. Done."],
      yt: "skyr muesli breakfast bowl" },
    l: { n: "Pea soup with mustard", fi: "Hernekeitto", k: 450, p: 24, c: 64, f: 8,
      ing: ["100 g dried green peas, soaked (or a carton of pea soup base)", "1 onion, chopped", "1 tsp mustard", "marjoram, salt", "2 slices rye bread"],
      st: ["Simmer soaked peas with the onion ~60 min until soft (or heat the carton base).", "Season with mustard and marjoram.", "Serve with rye bread."],
      yt: "hernekeitto finnish pea soup" },
    s: { n: "Pear + walnuts", k: 180, p: 3, c: 24, f: 8, ing: ["1 pear", "15 g walnuts"] },
    d: { n: "Greek chicken salad with pita", k: 520, p: 38, c: 40, f: 22,
      ing: ["130 g chicken breast", "30 g feta, crumbled", "cucumber, tomato, red onion", "20 g olives", "1 tbsp olive oil + lemon", "1 wholegrain pita"],
      st: ["Grill or pan-fry the chicken; slice it.", "Chop vegetables; toss with oil, lemon, olives and feta.", "Top with chicken; warm the pita on the side."],
      yt: "greek chicken salad recipe" },
    e: { n: "Plain yogurt", k: 100, p: 8, c: 10, f: 3, ing: ["150 g plain yogurt"] },
  },
  { /* Friday */
    b: { n: "Banana-peanut oatmeal", k: 380, p: 13, c: 58, f: 11,
      ing: ["70 g rolled oats", "2 dl milk or oat drink", "½ banana, sliced", "15 g peanut butter", "pinch of salt"],
      st: ["Simmer the oats in milk 5–7 min.", "Stir in the peanut butter off the heat.", "Top with banana."],
      yt: "peanut butter banana oatmeal" },
    l: { n: "Smoked salmon & spinach wrap", k: 480, p: 28, c: 46, f: 20,
      ing: ["1 wholegrain tortilla", "100 g hot-smoked salmon, flaked", "a handful of spinach", "50 g skyr + a squeeze of lemon", "cucumber sticks on the side"],
      st: ["Mix skyr with lemon; spread over the tortilla.", "Layer spinach and salmon; roll tightly.", "Halve and serve with cucumber."],
      yt: "smoked salmon wrap healthy" },
    s: { n: "Rye crisps, cottage cheese & tomato", k: 150, p: 12, c: 16, f: 4, ing: ["2 rye crispbreads", "50 g cottage cheese", "1 tomato"] },
    d: { n: "Chickpea & vegetable stew, brown rice", k: 540, p: 20, c: 78, f: 14,
      ing: ["1 can chickpeas, drained", "200 g crushed tomatoes", "1 bell pepper + 1 small zucchini", "1 onion + 1 garlic clove", "1 tsp cumin + 1 tsp paprika powder", "70 g brown rice (dry)"],
      st: ["Cook the rice per the pack.", "Soften onion, garlic and vegetables; add the spices.", "Add chickpeas and tomatoes; simmer 12 min; serve over rice."],
      yt: "chickpea vegetable stew easy" },
    e: { n: "Skyr + berries", k: 110, p: 12, c: 12, f: 1, ing: ["100 g skyr", "50 g berries"] },
  },
  { /* Saturday */
    b: { n: "Spinach & tomato omelette + rye", k: 380, p: 22, c: 28, f: 18,
      ing: ["2 eggs", "a handful of spinach", "1 tomato", "1 slice rye bread", "1 tsp rapeseed oil"],
      st: ["Whisk the eggs with a pinch of salt.", "Cook gently with spinach and tomato until just set.", "Serve with rye bread."],
      yt: "spinach tomato omelette" },
    l: { n: "Rainbow trout, dill potatoes & pickled cucumber", fi: "Kirjolohi", k: 520, p: 34, c: 48, f: 20,
      ing: ["140 g rainbow trout fillet", "250 g potatoes", "fresh dill", "½ cucumber, thinly sliced", "1 tbsp vinegar + pinch of sugar", "1 tsp rapeseed oil"],
      st: ["Boil the potatoes; pan-fry or bake the trout ~10 min.", "Quick-pickle the cucumber in vinegar while it cooks.", "Plate everything with plenty of dill."],
      yt: "rainbow trout dill potatoes" },
    s: { n: "Berries + yogurt", k: 140, p: 8, c: 18, f: 3, ing: ["100 g berries", "100 g plain yogurt"] },
    d: { n: "Turkey meatballs, root mash & lingonberry", k: 560, p: 38, c: 50, f: 22,
      ing: ["150 g turkey mince", "2 tbsp rolled oats + splash of milk (binder)", "250 g potato + carrot, for mash", "1 tbsp lingonberry jam", "salt, pepper, allspice"],
      st: ["Mix mince, oats, milk and spices; roll into balls.", "Bake 15 min at 200 °C (or pan-fry).", "Boil and mash the potato + carrot; serve with a spoonful of lingonberry."],
      yt: "turkey meatballs oven healthy" },
    e: { n: "Small handful of nuts", k: 100, p: 3, c: 3, f: 9, ing: ["15 g almonds & walnuts"] },
  },
  { /* Sunday */
    b: { n: "Oat pancakes with berries", k: 400, p: 16, c: 56, f: 12,
      ing: ["60 g rolled oats, blitzed to flour", "1 egg", "½ banana, mashed", "0.5 dl milk", "100 g berries", "50 g yogurt to top"],
      st: ["Blend oats, egg, banana and milk into a batter; rest 5 min.", "Fry small pancakes ~2 min per side.", "Top with berries and yogurt."],
      yt: "healthy oat pancakes recipe" },
    l: { n: "Roast chicken with oven vegetables", k: 520, p: 40, c: 44, f: 18,
      ing: ["150 g chicken breast or thigh fillet", "200 g potatoes", "2 carrots", "1 onion", "1 tbsp rapeseed oil", "rosemary or thyme"],
      st: ["Heat oven to 200 °C; toss everything with oil and herbs.", "Roast 30–35 min until golden.", "Rest briefly and serve."],
      yt: "roast chicken vegetables one pan" },
    s: { n: "Orange + almonds", k: 170, p: 4, c: 22, f: 8, ing: ["1 orange", "15 g almonds"] },
    d: { n: "Mediterranean fish stew with barley", k: 500, p: 34, c: 56, f: 12,
      ing: ["150 g white fish (e.g. pollock)", "200 g crushed tomatoes", "1 bell pepper + 1 onion + garlic", "60 g pearl barley (dry)", "paprika powder, pinch of chili", "parsley or dill"],
      st: ["Cook the barley per the pack.", "Simmer onion, garlic, pepper and tomatoes 8 min.", "Add fish chunks; poach 5–6 min; serve over barley."],
      yt: "mediterranean fish stew tomato" },
    e: { n: "Skyr", k: 100, p: 11, c: 8, f: 1, ing: ["100 g skyr"] },
  },
];

const EX = [
  { n: "Brisk walk", min: 35, k: 180 },
  { n: "Strength training", min: 40, k: 260 },
  { n: "Brisk walk", min: 35, k: 180 },
  { n: "Cycling or swimming", min: 40, k: 300 },
  { n: "Strength training", min: 30, k: 200 },
  { n: "Long walk outdoors", min: 60, k: 300 },
  { n: "Rest — easy stretching", min: 20, k: 80 },
];
const QUICK_EX = [
  { n: "Walk 30 min", k: 140 }, { n: "Walk 60 min", k: 280 },
  { n: "Gym 45 min", k: 280 }, { n: "Bike 40 min", k: 300 },
];

/* ─────────────────────────── starter grocery list ─────────────────────────── */
const STARTER_GROC = [
  { id: "g01", cat: "Fish & meat", n: "Salmon fillet", fi: "lohifilee", q: "≈ 260 g" },
  { id: "g02", cat: "Fish & meat", n: "Hot-smoked salmon", fi: "savulohi", q: "100 g" },
  { id: "g03", cat: "Fish & meat", n: "Rainbow trout fillet", fi: "kirjolohifilee", q: "≈ 140 g" },
  { id: "g04", cat: "Fish & meat", n: "White fish (pollock)", fi: "seiti", q: "≈ 150 g" },
  { id: "g05", cat: "Fish & meat", n: "Chicken breast", fi: "broilerin rintafilee", q: "≈ 560 g" },
  { id: "g06", cat: "Fish & meat", n: "Turkey mince", fi: "kalkkunajauheliha", q: "smallest pack (150 g used)" },
  { id: "g07", cat: "Fish & meat", n: "Tuna in water", fi: "tonnikala vedessä", q: "1 can" },
  { id: "g08", cat: "Dairy & eggs", n: "Eggs", fi: "kananmunat", q: "6-pack (4 used)" },
  { id: "g09", cat: "Dairy & eggs", n: "Skyr or quark, plain", fi: "maitorahka", q: "≈ 800 g" },
  { id: "g10", cat: "Dairy & eggs", n: "Plain yogurt", fi: "maustamaton jogurtti", q: "≈ 500 g" },
  { id: "g11", cat: "Dairy & eggs", n: "Cottage cheese", fi: "raejuusto", q: "200 g" },
  { id: "g12", cat: "Dairy & eggs", n: "Feta", fi: "fetajuusto", q: "small block (30 g used)" },
  { id: "g13", cat: "Dairy & eggs", n: "Oat cooking cream", fi: "kaurakerma", q: "1 small carton" },
  { id: "g14", cat: "Dairy & eggs", n: "Milk or oat drink", fi: "kauramaito", q: "1 L" },
  { id: "g15", cat: "Dairy & eggs", n: "Plant-based spread", fi: "kasvirasvalevite", q: "1 tub", st: true },
  { id: "g16", cat: "Fruit & vegetables", n: "Potatoes", fi: "peruna", q: "≈ 1.3 kg" },
  { id: "g17", cat: "Fruit & vegetables", n: "Carrots", fi: "porkkana", q: "≈ 800 g" },
  { id: "g18", cat: "Fruit & vegetables", n: "Onions", fi: "sipuli", q: "5" },
  { id: "g19", cat: "Fruit & vegetables", n: "Red onions", fi: "punasipuli", q: "2" },
  { id: "g20", cat: "Fruit & vegetables", n: "Garlic", fi: "valkosipuli", q: "1 bulb" },
  { id: "g21", cat: "Fruit & vegetables", n: "Leek", fi: "purjo", q: "1" },
  { id: "g22", cat: "Fruit & vegetables", n: "Tomatoes", fi: "tomaatti", q: "6" },
  { id: "g23", cat: "Fruit & vegetables", n: "Cucumber", fi: "kurkku", q: "2" },
  { id: "g24", cat: "Fruit & vegetables", n: "Spinach", fi: "pinaatti", q: "150 g bag" },
  { id: "g25", cat: "Fruit & vegetables", n: "Broccoli", fi: "parsakaali", q: "1 head" },
  { id: "g26", cat: "Fruit & vegetables", n: "Bell peppers", fi: "paprika", q: "2" },
  { id: "g27", cat: "Fruit & vegetables", n: "Zucchini", fi: "kesäkurpitsa", q: "1 small" },
  { id: "g28", cat: "Fruit & vegetables", n: "Lemons", fi: "sitruuna", q: "2" },
  { id: "g29", cat: "Fruit & vegetables", n: "Apples", fi: "omena", q: "3" },
  { id: "g30", cat: "Fruit & vegetables", n: "Pears", fi: "päärynä", q: "2" },
  { id: "g31", cat: "Fruit & vegetables", n: "Bananas", fi: "banaani", q: "2" },
  { id: "g32", cat: "Fruit & vegetables", n: "Oranges", fi: "appelsiini", q: "2" },
  { id: "g33", cat: "Fruit & vegetables", n: "Frozen berry mix", fi: "pakastemarjat", q: "600 g" },
  { id: "g34", cat: "Fruit & vegetables", n: "Fresh dill", fi: "tilli", q: "1 bunch" },
  { id: "g35", cat: "Bread & grains", n: "Rolled oats", fi: "kaurahiutaleet", q: "500 g" },
  { id: "g36", cat: "Bread & grains", n: "Rye bread", fi: "ruisleipä", q: "1 loaf" },
  { id: "g37", cat: "Bread & grains", n: "Rye crispbread", fi: "näkkileipä", q: "1 pack" },
  { id: "g38", cat: "Bread & grains", n: "Wholegrain rolls", fi: "täysjyväsämpylä", q: "2" },
  { id: "g39", cat: "Bread & grains", n: "Wholegrain tortillas", fi: "täysjyvätortilla", q: "1 pack" },
  { id: "g40", cat: "Bread & grains", n: "Wholegrain pita", fi: "täysjyväpita", q: "1 pack" },
  { id: "g41", cat: "Bread & grains", n: "Wholegrain pasta", fi: "täysjyväpasta", q: "200 g" },
  { id: "g42", cat: "Bread & grains", n: "Quinoa", fi: "kvinoa", q: "100 g" },
  { id: "g43", cat: "Bread & grains", n: "Brown rice", fi: "tumma riisi", q: "150 g" },
  { id: "g44", cat: "Bread & grains", n: "Pearl barley", fi: "ohrasuurimo", q: "100 g" },
  { id: "g45", cat: "Bread & grains", n: "Muesli, unsweetened", fi: "mysli", q: "small pack" },
  { id: "g46", cat: "Pantry & cans", n: "Crushed tomatoes", fi: "tomaattimurska", q: "3 × 400 g" },
  { id: "g47", cat: "Pantry & cans", n: "Red lentils", fi: "punaiset linssit", q: "100 g" },
  { id: "g48", cat: "Pantry & cans", n: "Dried peas / pea soup base", fi: "herne", q: "1" },
  { id: "g49", cat: "Pantry & cans", n: "Chickpeas", fi: "kikherneet", q: "1 can" },
  { id: "g50", cat: "Pantry & cans", n: "Hummus", fi: "hummus", q: "100 g" },
  { id: "g51", cat: "Pantry & cans", n: "Olives", fi: "oliivit", q: "1 small jar" },
  { id: "g52", cat: "Pantry & cans", n: "Walnuts", fi: "saksanpähkinä", q: "100 g" },
  { id: "g53", cat: "Pantry & cans", n: "Almonds", fi: "manteli", q: "100 g" },
  { id: "g54", cat: "Pantry & cans", n: "Peanut butter", fi: "maapähkinävoi", q: "1 jar", st: true },
  { id: "g55", cat: "Pantry & cans", n: "Rapeseed oil", fi: "rypsiöljy", q: "1 bottle", st: true },
  { id: "g56", cat: "Pantry & cans", n: "Olive oil", fi: "oliiviöljy", q: "1 bottle", st: true },
  { id: "g57", cat: "Pantry & cans", n: "Lingonberry jam", fi: "puolukkahillo", q: "small jar" },
  { id: "g58", cat: "Pantry & cans", n: "Ground flaxseed", fi: "pellavansiemenrouhe", q: "small pack", st: true },
  { id: "g59", cat: "Pantry & cans", n: "Stock cubes (fish + vegetable)", fi: "liemikuutio", q: "1 pack", st: true },
  { id: "g60", cat: "Pantry & cans", n: "Mustard", fi: "sinappi", q: "1", st: true },
  { id: "g61", cat: "Pantry & cans", n: "Ground cumin", fi: "roomankumina", q: "1 jar", st: true },
  { id: "g62", cat: "Pantry & cans", n: "Paprika powder", fi: "paprikajauhe", q: "1 jar", st: true },
  { id: "g63", cat: "Pantry & cans", n: "Cinnamon", fi: "kaneli", q: "1 jar", st: true },
  { id: "g64", cat: "Pantry & cans", n: "Marjoram", fi: "meirami", q: "1 jar", st: true },
  { id: "g65", cat: "Pantry & cans", n: "Allspice", fi: "maustepippuri", q: "1 jar", st: true },
  { id: "g66", cat: "Pantry & cans", n: "Rosemary or thyme", fi: "rosmariini", q: "1 jar", st: true },
  { id: "g67", cat: "Pantry & cans", n: "Vinegar (for pickling)", fi: "etikka", q: "1 bottle", st: true },
];
const GROC_CATS = ["Fish & meat", "Dairy & eggs", "Fruit & vegetables", "Bread & grains", "Pantry & cans"];
const CITIES = ["Helsinki", "Espoo", "Vantaa", "Kauniainen", "Uusimaa"];

/* ─────────────────────────── helpers ─────────────────────────── */
const enc = encodeURIComponent;
const sLink = (t) => "https://www.s-kaupat.fi/tuotehaku?queryString=" + enc(t);
const kLink = (t) => "https://www.k-ruoka.fi/kauppa/tuotehaku?haku=" + enc(t);
const ytLink = (t) => "https://www.youtube.com/results?search_query=" + enc(t + " recipe");
const mapsLink = (chain, city) => "https://www.google.com/maps/search/" + enc(chain + " " + city);

const pad = (x) => String(x).padStart(2, "0");
const dateKey = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const weekdayIdx = (d) => (d.getDay() + 6) % 7; // Mon = 0
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getSlotKey(h) {
  if (h < 5) return "night";
  if (h < 10.5) return "b";
  if (h < 14) return "l";
  if (h < 16.5) return "s";
  if (h < 20) return "d";
  if (h < 23) return "e";
  return "night";
}
const greetFor = (h) =>
  h < 5 ? "Quiet hours" : h < 11 ? "Good morning" : h < 15 ? "Good day" : h < 19 ? "Good afternoon" : "Good evening";

function calcTarget({ sex, age, h, w, act, pace }) {
  const bmr = 10 * w + 6.25 * h - 5 * age + (sex === "m" ? 5 : -161);
  const tdee = bmr * act;
  const floor = sex === "m" ? 1500 : 1200;
  return Math.round(Math.max(floor, tdee - pace) / 10) * 10;
}

const store = {
  async get(key) {
    try {
      if (!window.storage) return null;
      const r = await window.storage.get(key);
      return r && r.value ? JSON.parse(r.value) : null;
    } catch { return null; }
  },
  async set(key, val) {
    try { if (window.storage) await window.storage.set(key, JSON.stringify(val)); } catch {}
  },
};

const emptyLog = () => ({ m: {}, water: 0, ex: false, exx: [], extra: [] });
/* a slot in log.m can be: false/undefined (not eaten), true (eaten as planned), or {n, k} (ate something else) */
const slotKcal = (log, day, s) => { const v = log.m[s]; if (!v) return 0; return typeof v === "object" ? (v.k || 0) : day[s].k; };
const userPrefix = (email) => "u:" + enc(email.trim().toLowerCase()).replace(/'/g, "%27") + ":";

async function sha256(s) {
  try {
    if (window.crypto && window.crypto.subtle) {
      const buf = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
      return Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, "0")).join("");
    }
  } catch {}
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return "x" + (h >>> 0).toString(16);
}
function randSalt() {
  try {
    return Array.from(window.crypto.getRandomValues(new Uint8Array(8))).map((x) => x.toString(16).padStart(2, "0")).join("");
  } catch { return String(Math.random()).slice(2, 14); }
}

/* ─────────────────────────── AI plan generation ─────────────────────────── */
const CAT_MAP = { fish: "Fish & meat", dairy: "Dairy & eggs", produce: "Fruit & vegetables", grain: "Bread & grains", pantry: "Pantry & cans" };
const THEMES = [
  "Finnish classic: oat porridge breakfast, creamy-light salmon soup (lohikeitto) lunch, poultry tray bake dinner",
  "Egg-and-rye breakfast, legume soup lunch (lentil or bean), oven-baked salmon (uunilohi style) dinner",
  "Overnight oats breakfast, chicken grain bowl lunch, wholegrain pasta with canned fish dinner",
  "Skyr bowl breakfast, Finnish pea soup (hernekeitto) lunch, Mediterranean chicken salad dinner",
  "Warm oatmeal breakfast, smoked-fish wrap lunch, vegetarian chickpea or bean stew dinner",
  "Vegetable omelette breakfast, rainbow trout with dill potatoes lunch, lean turkey mince dinner with lingonberry",
  "Weekend oat pancakes breakfast, roast chicken lunch, Mediterranean fish & tomato stew with barley dinner",
];

async function genDay(i, cfg) {
  const T = cfg.target;
  const budget = {
    b: Math.round(T * 0.22 / 10) * 10, l: Math.round(T * 0.29 / 10) * 10,
    s: Math.round(T * 0.10 / 10) * 10, d: Math.round(T * 0.32 / 10) * 10,
    e: Math.round(T * 0.07 / 10) * 10,
  };
  const allergyLine = cfg.allergies ? ' STRICT ALLERGY RULE: completely exclude and never use: ' + cfg.allergies + '.' : '';
  const prompt =
    "Plan " + DAY_NAMES[i] + "'s food for a Finnish home cook (" + (cfg.sex === "m" ? "male" : "female") + ", " + cfg.age + " y, daily target " + T + " kcal)." +
    " Style: everyday Finnish + Mediterranean, cholesterol-friendly: fatty fish, oats, rye, legumes, vegetables, berries, rapeseed/olive oil; avoid red & processed meat, butter, cream, added sugar." + allergyLine +
    " Day theme: " + THEMES[i] + "." +
    " Meal kcal near: breakfast " + budget.b + ", lunch " + budget.l + ", afternoon snack " + budget.s + ", dinner " + budget.d + ", evening bite " + budget.e + "; the five k values must sum within 5% of " + T + "." +
    ' Reply with ONLY minified valid JSON, no markdown, no prose: {"b":{"n":"English name","fi":"Finnish dish name or null","k":340,"p":15,"c":45,"f":10,"ing":["70 g rolled oats","2 dl oat drink"],"st":["short step","short step"],"yt":"youtube search words"},"l":{...},"s":{...},"d":{...},"e":{...},"items":[["kaurahiutaleet","Rolled oats","grain","70 g"],["rypsiöljy","Rapeseed oil","pantry","1 tbsp",1]]}.' +
    ' Rules: k,p,c,f are numbers; ing max 8 short strings with metric amounts; st max 3 steps of max 10 words; s and e are assembly-only snacks with "st":[] and "yt":null; items = EVERY purchasable ingredient of the day as [finnishShopName, EnglishName, cat, quantity, optional 1 if pantry staple like oil or spice], cat exactly one of fish|dairy|produce|grain|pantry, max 16 items (merge similar). Keep every string short; whole reply under 3500 characters.';

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await r.json();
  if (!data || data.type === "error" || !data.content) throw new Error("api");
  const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const j0 = text.indexOf("{"), j1 = text.lastIndexOf("}");
  if (j0 < 0 || j1 <= j0) throw new Error("nojson");
  const day = JSON.parse(text.slice(j0, j1 + 1));
  const ok = SLOTS.every((s) => day[s] && typeof day[s].n === "string" && typeof day[s].k === "number" && Array.isArray(day[s].ing));
  if (!ok) throw new Error("shape");
  if (!Array.isArray(day.items) || day.items.length < 5) throw new Error("items");
  return day;
}

function aggregateItems(rows) {
  const map = {};
  rows.forEach((row) => {
    if (!Array.isArray(row) || row.length < 4) return;
    const fi = String(row[0] || "").trim();
    if (!fi) return;
    const key = fi.toLowerCase();
    const en = String(row[1] || fi).trim();
    const cat = CAT_MAP[String(row[2] || "pantry").toLowerCase()] || "Pantry & cans";
    const q = String(row[3] || "").trim();
    const st = row[4] === 1 || row[4] === true;
    if (!map[key]) map[key] = { fi, n: en, cat, st: !!st, nums: {}, texts: [] };
    if (st) map[key].st = true;
    const m = q.match(/^([\d.,]+)\s*(g|kg|ml|dl|l|tbsp|tsp|kpl|pcs|cans?|slices?)?\.?$/i);
    if (m) {
      const num = parseFloat(m[1].replace(",", "."));
      const unit = (m[2] || "x").toLowerCase();
      if (!isNaN(num)) { map[key].nums[unit] = (map[key].nums[unit] || 0) + num; return; }
    }
    if (q && !map[key].texts.includes(q)) map[key].texts.push(q);
  });
  const list = Object.values(map).map((it) => {
    const parts = [];
    Object.keys(it.nums).forEach((u) => {
      let v = it.nums[u], unit = u;
      if (u === "g" && v >= 1000) { v = Math.round(v / 100) / 10; unit = "kg"; }
      else v = Math.round(v * 10) / 10;
      parts.push(unit === "x" ? String(v) : v + " " + unit);
    });
    it.texts.slice(0, 2).forEach((t) => parts.push(t));
    return { cat: it.cat, n: it.n, fi: it.fi, q: parts.join(" + ") || "as needed", st: it.st };
  });
  list.sort((a, b) => (GROC_CATS.indexOf(a.cat) - GROC_CATS.indexOf(b.cat)) || a.n.localeCompare(b.n));
  return list.map((it, i) => ({ id: "g" + pad(i + 1), ...it }));
}

async function generatePlan(cfg, onStep) {
  const days = new Array(7);
  await Promise.all(
    [0, 1, 2, 3, 4, 5, 6].map(async (i) => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try { days[i] = await genDay(i, cfg); onStep(i, "done"); return; } catch (e) {}
      }
      onStep(i, "fail");
    })
  );
  if (days.some((d) => !d)) throw new Error("partial");
  const allItems = days.flatMap((d) => d.items || []);
  const groc = aggregateItems(allItems);
  const cleanDays = days.map((d) => {
    const o = {};
    SLOTS.forEach((s) => { o[s] = { n: d[s].n, fi: d[s].fi || null, k: Math.round(d[s].k), p: Math.round(d[s].p || 0), c: Math.round(d[s].c || 0), f: Math.round(d[s].f || 0), ing: d[s].ing.slice(0, 10), st: Array.isArray(d[s].st) && d[s].st.length ? d[s].st.slice(0, 4) : undefined, yt: d[s].yt || undefined }; });
    return o;
  });
  return { v: 1, created: Date.now(), starter: false, days: cleanDays, groc };
}

/* ─────────────────────────── small ui pieces ─────────────────────────── */
function Ring({ pct, over, size = 58, label, sub }) {
  const r = (size - 8) / 2, circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.line} strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={over ? C.berry : C.cloud} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - clamped)}
          style={{ transition: "stroke-dashoffset .6s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="disp font-bold" style={{ fontSize: 15, color: over ? C.berry : C.ink }}>{label}</span>
        {sub && <span style={{ fontSize: 8, color: C.sub, marginTop: 2 }}>{sub}</span>}
      </div>
    </div>
  );
}

function MacroChips({ m }) {
  const chip = (t, v) => (
    <span className="rounded-full px-2 py-1 text-xs font-medium"
      style={{ background: C.paper, color: C.sub }}>{t} {v} g</span>
  );
  return (
    <div className="flex flex-wrap gap-2">
      <span className="rounded-full px-2 py-1 text-xs font-semibold"
        style={{ background: C.cloudSoft, color: C.cloud }}>{m.k} kcal</span>
      {chip("Protein", m.p)}{chip("Carbs", m.c)}{chip("Fat", m.f)}
    </div>
  );
}

function MealDetails({ m }) {
  return (
    <div className="flex flex-col gap-3 pt-3">
      <MacroChips m={m} />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: C.sub }}>Ingredients</p>
        <ul className="flex flex-col gap-1">
          {m.ing.map((x, i) => (
            <li key={i} className="text-sm flex gap-2" style={{ color: C.ink }}>
              <span style={{ color: C.cloud }}>•</span><span>{x}</span>
            </li>
          ))}
        </ul>
      </div>
      {m.st && m.st.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: C.sub }}>How to make it</p>
          <ol className="flex flex-col gap-1">
            {m.st.map((x, i) => (
              <li key={i} className="text-sm flex gap-2" style={{ color: C.ink }}>
                <span className="disp font-bold" style={{ color: C.cloud, minWidth: 14 }}>{i + 1}</span><span>{x}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {m.yt && (
        <a href={ytLink(m.yt)} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-2 self-start rounded-full px-3 py-2 text-sm font-medium"
          style={{ background: C.paper, color: C.ink }}>
          <Youtube size={16} style={{ color: C.berry }} /> Watch how it's made <ExternalLink size={13} style={{ color: C.sub }} />
        </a>
      )}
    </div>
  );
}

function CustomEat({ value, planned, onLog, onClear }) {
  const [open, setOpen] = useState(false);
  const [n, setN] = useState("");
  const [k, setK] = useState("");
  if (value && typeof value === "object") {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2" style={{ background: C.cloudSoft }}>
        <p className="text-sm min-w-0" style={{ color: C.ink }}>
          Logged instead: <b>{value.n || "something else"}</b> · {value.k} kcal
          <span style={{ color: C.sub }}> (plan {planned})</span>
        </p>
        <button aria-label="Remove logged food" onClick={onClear} className="shrink-0">
          <X size={15} style={{ color: C.sub }} />
        </button>
      </div>
    );
  }
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm font-medium text-left" style={{ color: C.lake }}>
        Ate something else? Log its calories →
      </button>
    );
  }
  const logIt = () => {
    const kk = parseInt(k, 10);
    if (!kk || kk <= 0) return;
    onLog({ n: n.trim(), k: kk });
    setOpen(false); setN(""); setK("");
  };
  return (
    <div className="flex gap-2">
      <input value={n} onChange={(e) => setN(e.target.value)} placeholder="What (optional)"
        className="flex-1 min-w-0 rounded-xl px-3 py-2 text-sm outline-none"
        style={{ background: C.paper, color: C.ink, border: "1px solid " + C.line }} />
      <input value={k} onChange={(e) => setK(e.target.value.replace(/\D/g, ""))} placeholder="kcal" inputMode="numeric"
        onKeyDown={(e) => { if (e.key === "Enter") logIt(); }}
        className="rounded-xl px-3 py-2 text-sm outline-none"
        style={{ width: 74, background: C.paper, color: C.ink, border: "1px solid " + C.line }} />
      <button onClick={logIt} className="rounded-xl px-3 font-semibold text-sm" style={{ background: C.ink, color: "#fff" }}>Log</button>
    </div>
  );
}

function MealCard({ slot, meal, eaten, custom, onToggle, onLogCustom, onClearCustom, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const meta = SLOT_META[slot];
  return (
    <div className="rounded-2xl" style={{ background: C.card, border: "1px solid " + C.line }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 p-4 text-left">
        <span role="checkbox" aria-checked={eaten} tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onToggle(); } }}
          className="flex items-center justify-center rounded-full shrink-0"
          style={{
            width: 26, height: 26, cursor: "pointer",
            background: eaten ? C.cloud : "transparent",
            border: "2px solid " + (eaten ? C.cloud : C.line),
          }}>
          {eaten && <Check size={15} color="#fff" strokeWidth={3} />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-xs font-semibold uppercase tracking-wide" style={{ color: C.sub }}>
            {meta.label} · {meta.hint}
          </span>
          <span className="block font-semibold text-sm" style={{ color: C.ink, textDecoration: eaten ? "line-through" : "none", opacity: eaten ? 0.6 : 1 }}>
            {meal.n}{meal.fi ? <span className="font-normal" style={{ color: C.sub }}> · {meal.fi}</span> : null}
          </span>
        </span>
        <span className="text-sm font-semibold disp shrink-0" style={{ color: custom ? C.cloud : C.sub }}>{custom ? custom.k : meal.k}</span>
        <ChevronDown size={18} style={{ color: C.sub, transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
      </button>
      {open && (
        <div className="px-4 pb-4" style={{ borderTop: "1px solid " + C.line }}>
          <div className="pt-3">
            <CustomEat value={custom} planned={meal.k} onLog={onLogCustom} onClear={onClearCustom} />
          </div>
          <MealDetails m={meal} />
        </div>
      )}
    </div>
  );
}

/* the signature: a live strip of the day */
function DayStrip({ nowT, log }) {
  const dots = [
    { t: 7.5, slot: "b" }, { t: 12, slot: "l" }, { t: 15, slot: "s" },
    { t: 17, slot: "ex" }, { t: 18.2, slot: "d" }, { t: 20.5, slot: "e" },
  ];
  const pct = (t) => Math.max(0, Math.min(100, ((t - 5) / 18) * 100));
  return (
    <div className="px-1 pt-1 pb-4" aria-hidden="true">
      <div className="relative" style={{ height: 26 }}>
        <div className="absolute left-0 right-0" style={{ top: 11, height: 2, background: C.line, borderRadius: 2 }} />
        <div className="absolute left-0" style={{ top: 11, height: 2, width: pct(nowT) + "%", background: C.cloud, borderRadius: 2, transition: "width .5s" }} />
        {dots.map((d) => {
          const done = d.slot === "ex" ? log.ex : !!log.m[d.slot];
          const isEx = d.slot === "ex";
          return (
            <div key={d.slot} className="absolute flex flex-col items-center" style={{ left: pct(d.t) + "%", top: 5, transform: "translateX(-50%)" }}>
              <span className="rounded-full" style={{
                width: 13, height: 13,
                background: done ? (isEx ? C.cloud : C.ink) : C.card,
                border: "2px solid " + (isEx ? C.cloud : C.ink),
              }} />
              <span style={{ fontSize: 8, color: C.sub, marginTop: 2, fontWeight: 600 }}>
                {isEx ? "move" : SLOT_META[d.slot].label[0]}
              </span>
            </div>
          );
        })}
        <div className="absolute" style={{ left: pct(nowT) + "%", top: 0, transform: "translateX(-50%)" }}>
          <span className="block rounded-full pulse" style={{ width: 9, height: 9, background: C.cloud, border: "2px solid #fff", boxShadow: "0 0 0 2px " + C.cloud }} />
        </div>
      </div>
      <div className="flex justify-between" style={{ fontSize: 9, color: C.sub }}>
        <span>05</span><span>11</span><span>17</span><span>23</span>
      </div>
    </div>
  );
}

/* ─────────────────────────── main views ─────────────────────────── */
function NowView({ now, wd, days, log, setLog, target, waterGoal, firstName, goToday }) {
  const h = now.getHours() + now.getMinutes() / 60;
  const slotKey = getSlotKey(h);
  const night = slotKey === "night";
  const day = days[wd];
  const meal = night ? null : day[slotKey];
  const nextB = days[(wd + 1) % 7].b;

  const eatenK = SLOTS.reduce((a, s) => a + slotKcal(log, day, s), 0) + log.extra.reduce((a, x) => a + x.k, 0);
  const burned = (log.ex ? EX[wd].k : 0) + log.exx.reduce((a, x) => a + x.k, 0);
  const remaining = target - eatenK + burned;
  const ex = EX[wd];
  const moveWindow = h >= 16 && h < 20 && !log.ex && wd !== 6;

  const toggleSlot = (s) => setLog({ ...log, m: { ...log.m, [s]: !log.m[s] } });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm" style={{ color: C.sub }}>
          {greetFor(h)}{firstName ? ", " + firstName : ""} — {DAY_NAMES[wd]} {now.getDate()}.{now.getMonth() + 1}.
        </p>
        <h1 className="disp font-extrabold" style={{ fontSize: 26, color: C.ink, lineHeight: 1.15 }}>
          {night ? "The day is done." : "Right now: " + SLOT_META[slotKey].label.toLowerCase()}
        </h1>
      </div>

      <DayStrip nowT={h} log={log} />

      {night ? (
        <div className="rounded-2xl p-5 flex items-start gap-4" style={{ background: C.card, border: "1px solid " + C.line }}>
          <Moon size={22} style={{ color: C.lake, marginTop: 2 }} />
          <div>
            <p className="font-semibold" style={{ color: C.ink }}>Kitchen's closed — time to rest.</p>
            <p className="text-sm mt-1" style={{ color: C.sub }}>
              Tomorrow's breakfast: <span className="font-medium" style={{ color: C.ink }}>{nextB.n}</span> ({nextB.k} kcal).
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: C.card, border: "1px solid " + C.line }}>
          <div className="p-5 pb-4">
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold uppercase tracking-wide"
              style={{ background: C.cloudSoft, color: C.cloud }}>
              <Clock size={12} /> now · {SLOT_META[slotKey].hint}
            </span>
            <h2 className="disp font-bold mt-3" style={{ fontSize: 24, color: C.ink, lineHeight: 1.2 }}>{meal.n}</h2>
            {meal.fi && <p className="text-sm mt-1" style={{ color: C.sub }}>{meal.fi}</p>}
            <div className="mt-3"><MacroChips m={meal} /></div>
            <button onClick={() => toggleSlot(slotKey)}
              className="mt-4 w-full rounded-full py-3 font-semibold text-sm flex items-center justify-center gap-2"
              style={{ background: log.m[slotKey] ? C.cloud : C.ink, color: "#fff" }}>
              <Check size={17} />
              {typeof log.m[slotKey] === "object"
                ? "Eaten — " + log.m[slotKey].k + " kcal logged"
                : log.m[slotKey] ? "Eaten — nicely done" : "Mark as eaten"}
            </button>
            <div className="mt-3">
              <CustomEat value={log.m[slotKey]} planned={meal.k}
                onLog={(v) => setLog({ ...log, m: { ...log.m, [slotKey]: v } })}
                onClear={() => setLog({ ...log, m: { ...log.m, [slotKey]: false } })} />
            </div>
          </div>
          <DetailsToggle meal={meal} />
        </div>
      )}

      {moveWindow && (
        <button onClick={goToday} className="rounded-2xl p-4 flex items-center gap-3 text-left"
          style={{ background: C.cloudSoft, border: "1px solid " + C.cloud }}>
          <Footprints size={20} style={{ color: C.cloud }} />
          <span className="text-sm" style={{ color: C.ink }}>
            Good window for today's <b>{ex.n.toLowerCase()}</b> — {ex.min} min.
          </span>
        </button>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl p-3 flex flex-col items-center gap-1" style={{ background: C.card, border: "1px solid " + C.line }}>
          <Ring pct={eatenK / Math.max(1, target)} over={remaining < 0}
            label={remaining < 0 ? "+" + Math.abs(remaining) : String(remaining)} sub={remaining < 0 ? "over" : "kcal left"} />
          <p className="text-xs" style={{ color: C.sub }}>of {target}</p>
        </div>
        <button onClick={() => setLog({ ...log, water: Math.min(waterGoal, log.water + 1) })}
          className="rounded-2xl p-3 flex flex-col items-center justify-center gap-1"
          style={{ background: C.lakeSoft, border: "1px solid " + C.line }}>
          <Droplets size={20} style={{ color: C.lake }} />
          <p className="disp font-bold" style={{ color: C.lake, fontSize: 16 }}>{log.water}/{waterGoal}</p>
          <p className="text-xs" style={{ color: C.sub }}>tap to drink</p>
        </button>
        <button onClick={() => setLog({ ...log, ex: !log.ex })}
          className="rounded-2xl p-3 flex flex-col items-center justify-center gap-1"
          style={{ background: log.ex ? C.cloudSoft : C.card, border: "1px solid " + C.line }}>
          <Footprints size={20} style={{ color: log.ex ? C.cloud : C.sub }} />
          <p className="text-xs font-semibold text-center leading-tight" style={{ color: C.ink }}>{ex.n}</p>
          <p className="text-xs" style={{ color: C.sub }}>{log.ex ? "done ✓" : ex.min + " min"}</p>
        </button>
      </div>
    </div>
  );
}

function DetailsToggle({ meal }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: "1px solid " + C.line }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-center gap-1 py-3 text-sm font-medium" style={{ color: C.lake }}>
        {open ? "Hide" : "Ingredients & how to make it"}
        <ChevronDown size={16} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
      </button>
      {open && <div className="px-5 pb-5"><MealDetails m={meal} /></div>}
    </div>
  );
}

function TodayView({ now, wd, days, log, setLog, target, waterGoal }) {
  const [exName, setExName] = useState("");
  const [exKcal, setExKcal] = useState("");
  const day = days[wd];
  const eatenK = SLOTS.reduce((a, s) => a + slotKcal(log, day, s), 0) + log.extra.reduce((a, x) => a + x.k, 0);
  const burned = (log.ex ? EX[wd].k : 0) + log.exx.reduce((a, x) => a + x.k, 0);
  const remaining = target - eatenK + burned;
  const ex = EX[wd];

  const addExtra = () => {
    const k = parseInt(exKcal, 10);
    if (!k || k <= 0) return;
    setLog({ ...log, extra: [...log.extra, { n: exName.trim() || "Extra", k }] });
    setExName(""); setExKcal("");
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm" style={{ color: C.sub }}>{DAY_NAMES[wd]} {now.getDate()}.{now.getMonth() + 1}.</p>
        <h1 className="disp font-extrabold" style={{ fontSize: 26, color: C.ink }}>Today's plan</h1>
      </div>

      <div className="rounded-2xl p-4 flex items-center justify-between" style={{ background: C.ink }}>
        <div>
          <p className="text-xs" style={{ color: "#B9C6BF" }}>Eaten {eatenK} · burned +{burned}</p>
          <p className="disp font-bold" style={{ color: "#fff", fontSize: 20 }}>
            {remaining < 0 ? Math.abs(remaining) + " kcal over" : remaining + " kcal left"}
          </p>
        </div>
        <Flame size={22} style={{ color: remaining < 0 ? "#E8A9AC" : C.cloud }} />
      </div>

      <div className="flex flex-col gap-2">
        {SLOTS.map((s) => (
          <MealCard key={s} slot={s} meal={day[s]} eaten={!!log.m[s]}
            custom={typeof log.m[s] === "object" ? log.m[s] : null}
            onToggle={() => setLog({ ...log, m: { ...log.m, [s]: !log.m[s] } })}
            onLogCustom={(v) => setLog({ ...log, m: { ...log.m, [s]: v } })}
            onClearCustom={() => setLog({ ...log, m: { ...log.m, [s]: false } })} />
        ))}
      </div>

      {/* movement */}
      <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: C.card, border: "1px solid " + C.line }}>
        <div className="flex items-center gap-3">
          <Footprints size={20} style={{ color: C.cloud }} />
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.sub }}>Movement · ≈ 17:00</p>
            <p className="font-semibold text-sm" style={{ color: C.ink }}>{ex.n} · {ex.min} min <span className="font-normal" style={{ color: C.sub }}>≈ {ex.k} kcal</span></p>
          </div>
          <button onClick={() => setLog({ ...log, ex: !log.ex })}
            className="rounded-full px-4 py-2 text-sm font-semibold"
            style={{ background: log.ex ? C.cloud : C.paper, color: log.ex ? "#fff" : C.ink }}>
            {log.ex ? "Done ✓" : "Mark done"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_EX.map((q) => (
            <button key={q.n} onClick={() => setLog({ ...log, exx: [...log.exx, q] })}
              className="rounded-full px-3 py-1 text-xs font-medium"
              style={{ background: C.paper, color: C.sub, border: "1px solid " + C.line }}>
              + {q.n}
            </button>
          ))}
        </div>
        {log.exx.length > 0 && (
          <div className="flex flex-col gap-1">
            {log.exx.map((x, i) => (
              <div key={i} className="flex items-center justify-between text-sm" style={{ color: C.ink }}>
                <span>{x.n} · +{x.k} kcal</span>
                <button aria-label="Remove" onClick={() => setLog({ ...log, exx: log.exx.filter((_, j) => j !== i) })}>
                  <X size={15} style={{ color: C.sub }} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* water */}
      <div className="rounded-2xl p-4" style={{ background: C.lakeSoft, border: "1px solid " + C.line }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold flex items-center gap-2" style={{ color: C.ink }}>
            <Droplets size={17} style={{ color: C.lake }} /> Water — aim for {waterGoal} glasses (≈ {Math.round(waterGoal * 0.25 * 10) / 10} L)
          </p>
          <div className="flex gap-2">
            <button aria-label="One less glass" onClick={() => setLog({ ...log, water: Math.max(0, log.water - 1) })}
              className="rounded-full p-1" style={{ background: "#fff" }}><Minus size={15} style={{ color: C.lake }} /></button>
            <button aria-label="One more glass" onClick={() => setLog({ ...log, water: Math.min(waterGoal, log.water + 1) })}
              className="rounded-full p-1" style={{ background: C.lake }}><Plus size={15} color="#fff" /></button>
          </div>
        </div>
        <div className="flex gap-2">
          {Array.from({ length: waterGoal }).map((_, i) => (
            <span key={i} className="flex-1 rounded-full" style={{ height: 9, background: i < log.water ? C.lake : "#fff", border: "1px solid " + C.lake, transition: "background .2s" }} />
          ))}
        </div>
      </div>

      {/* ate something extra */}
      <div className="rounded-2xl p-4 flex flex-col gap-2" style={{ background: C.card, border: "1px solid " + C.line }}>
        <p className="text-sm font-semibold" style={{ color: C.ink }}>Ate something extra?</p>
        <p className="text-xs" style={{ color: C.sub, marginTop: -4 }}>
          Adds on top of the meals. To swap a whole meal, open it above and log what you ate instead.
        </p>
        <div className="flex gap-2">
          <input value={exName} onChange={(e) => setExName(e.target.value)} placeholder="What (optional)"
            className="flex-1 min-w-0 rounded-xl px-3 py-2 text-sm outline-none"
            style={{ background: C.paper, color: C.ink, border: "1px solid " + C.line }} />
          <input value={exKcal} onChange={(e) => setExKcal(e.target.value.replace(/\D/g, ""))} placeholder="kcal" inputMode="numeric"
            className="rounded-xl px-3 py-2 text-sm outline-none" style={{ width: 76, background: C.paper, color: C.ink, border: "1px solid " + C.line }} />
          <button onClick={addExtra} className="rounded-xl px-3 font-semibold text-sm" style={{ background: C.ink, color: "#fff" }}>Add</button>
        </div>
        {log.extra.map((x, i) => (
          <div key={i} className="flex items-center justify-between text-sm" style={{ color: C.ink }}>
            <span>{x.n} · {x.k} kcal</span>
            <button aria-label="Remove" onClick={() => setLog({ ...log, extra: log.extra.filter((_, j) => j !== i) })}>
              <X size={15} style={{ color: C.sub }} />
            </button>
          </div>
        ))}
      </div>

      <p className="text-xs px-1" style={{ color: C.sub }}>
        Nutrition values are estimates for one home-cooked portion; movement numbers are rough averages.
      </p>
    </div>
  );
}

function WeekView({ wd, days, starter }) {
  const [open, setOpen] = useState(wd);
  const dayTotal = (i) => SLOTS.reduce((a, s) => a + days[i][s].k, 0);
  const avg = Math.round([0, 1, 2, 3, 4, 5, 6].reduce((a, i) => a + dayTotal(i), 0) / 7);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm" style={{ color: C.sub }}>The map of the week — tap a day to peek.</p>
        <h1 className="disp font-extrabold" style={{ fontSize: 26, color: C.ink }}>This week</h1>
      </div>
      <div className="flex flex-col gap-2">
        {days.map((day, i) => {
          const isToday = i === wd, isOpen = open === i;
          return (
            <div key={i} className="rounded-2xl overflow-hidden" style={{ background: C.card, border: "1px solid " + (isToday ? C.ink : C.line) }}>
              <button onClick={() => setOpen(isOpen ? -1 : i)} className="w-full flex items-center gap-3 p-4 text-left">
                <span className="disp font-bold rounded-xl flex items-center justify-center shrink-0"
                  style={{ width: 44, height: 44, background: isToday ? C.ink : C.paper, color: isToday ? "#fff" : C.ink, fontSize: 13 }}>
                  {DAY_SHORT[i]}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold truncate" style={{ color: C.ink }}>{day.d.n}</span>
                  <span className="block text-xs" style={{ color: C.sub }}>
                    {dayTotal(i)} kcal · {EX[i].n} {EX[i].min} min
                  </span>
                </span>
                {isToday && <span className="text-xs font-bold uppercase rounded-full px-2 py-1" style={{ background: C.cloudSoft, color: C.cloud }}>today</span>}
                <ChevronDown size={18} style={{ color: C.sub, transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
              </button>
              {isOpen && (
                <div className="px-4 pb-4 flex flex-col gap-2" style={{ borderTop: "1px solid " + C.line }}>
                  {SLOTS.map((s) => (
                    <div key={s} className="flex items-baseline gap-2 pt-2 text-sm">
                      <span className="text-xs font-semibold uppercase shrink-0" style={{ color: C.sub, width: 74 }}>{SLOT_META[s].label}</span>
                      <span className="flex-1" style={{ color: C.ink }}>{day[s].n}</span>
                      <span className="disp text-xs font-semibold" style={{ color: C.sub }}>{day[s].k}</span>
                    </div>
                  ))}
                  <div className="flex items-baseline gap-2 pt-2 text-sm" style={{ borderTop: "1px dashed " + C.line }}>
                    <span className="text-xs font-semibold uppercase shrink-0" style={{ color: C.cloud, width: 74 }}>Move</span>
                    <span className="flex-1" style={{ color: C.ink }}>{EX[i].n}</span>
                    <span className="disp text-xs font-semibold" style={{ color: C.sub }}>{EX[i].min} min</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs px-1" style={{ color: C.sub }}>
        Weekly average ≈ {avg} kcal/day{starter ? ", from the built-in Finnish starter plan" : ", generated for your profile"} — fish, oats, rye, legumes and plenty of vegetables: the cholesterol-friendly core.
      </p>
    </div>
  );
}

function GroceriesView({ items, groc, setGroc, city, onCity, okey }) {
  const [filter, setFilter] = useState("all");
  const [offers, setOffers] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr] = useState(false);
  const bootRef = useRef(false);

  async function runScan() {
    setScanning(true); setScanErr(false);
    try {
      const listStr = items.map((g) => g.id + "=" + g.fi).join(", ");
      const prompt =
        "Today is " + new Date().toLocaleDateString("fi-FI") +
        ". I buy groceries in the Helsinki region, Finland. Step 1: use web search (a few searches) to find THIS WEEK'S grocery discounts at Finnish chains: S-Group (Prisma / S-market, s-kaupat.fi kampanjat), K-Group (K-Citymarket / K-Supermarket, k-ruoka.fi tarjoukset) and Lidl Suomi (lidl.fi). Step 2: match found offers to my list of item codes (code=finnish name): " + listStr +
        '. Step 3: reply with ONLY minified valid JSON, no markdown fences, no prose: {"deals":[{"id":"g01","store":"S","deal":"lohifilee 9,95 €/kg"}],"note":"one short sentence on where the best savings are this week"}. Rules: store is exactly "S", "K" or "L"; max 15 deals; only real current offers you actually found (empty array if none); each deal text under 8 words, include the price when known.';
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
          tools: [{ type: "web_search_20250305", name: "web_search" }],
        }),
      });
      const data = await r.json();
      if (!data || data.type === "error" || !data.content) throw new Error("api");
      const text = data.content.filter((x) => x.type === "text").map((x) => x.text).join("\n");
      const j0 = text.indexOf("{"), j1 = text.lastIndexOf("}");
      if (j0 < 0 || j1 <= j0) throw new Error("nojson");
      const p = JSON.parse(text.slice(j0, j1 + 1));
      const valid = new Set(items.map((g) => g.id));
      const deals = (Array.isArray(p.deals) ? p.deals : [])
        .filter((d) => d && valid.has(d.id) && ["S", "K", "L"].includes(d.store))
        .map((d) => ({ id: d.id, store: d.store, deal: String(d.deal || "on offer").slice(0, 60) }));
      const res = { checked: Date.now(), deals, note: String(p.note || "").slice(0, 160) };
      setOffers(res);
      store.set(okey, res);
    } catch (e) { setScanErr(true); }
    setScanning(false);
  }

  /* when the list is opened: use a fresh cache, otherwise scan automatically */
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    (async () => {
      const cached = await store.get(okey);
      if (cached) setOffers(cached);
      if (!cached || Date.now() - cached.checked > 12 * 3600 * 1000) runScan();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dealMap = {};
  (offers ? offers.deals : []).forEach((d) => { dealMap[d.id] = d; });
  const applyDeals = () => {
    const next = { ...groc.store };
    (offers ? offers.deals : []).forEach((d) => { next[d.id] = d.store; });
    setGroc({ ...groc, store: next });
  };
  const fmtChecked = (t) => { const d = new Date(t); return d.getDate() + "." + (d.getMonth() + 1) + ". " + pad(d.getHours()) + ":" + pad(d.getMinutes()); };

  const checkedCount = items.filter((g) => groc.checked[g.id]).length;
  const cycle = { null: "S", undefined: "S", S: "K", K: "L", L: null };
  const visible = items.filter((g) => filter === "all" || groc.store[g.id] === filter);
  const counts = { S: 0, K: 0, L: 0 };
  items.forEach((g) => { if (groc.store[g.id]) counts[groc.store[g.id]]++; });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm" style={{ color: C.sub }}>Everything the week's menu needs — for one person.</p>
        <h1 className="disp font-extrabold" style={{ fontSize: 26, color: C.ink }}>Groceries</h1>
      </div>

      {/* area + nearest stores */}
      <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: C.card, border: "1px solid " + C.line }}>
        <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.sub }}>
          Your area
          <select value={city} onChange={(e) => onCity(e.target.value)}
            className="mt-1 w-full rounded-xl px-3 py-2 text-sm font-normal normal-case outline-none"
            style={{ background: C.paper, color: C.ink, border: "1px solid " + C.line }}>
            {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          {[["Prisma", "S"], ["K-Citymarket", "K"], ["Lidl", "L"]].map(([name, tag]) => (
            <a key={name} href={mapsLink(name, city)} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-medium"
              style={{ background: STORE_STYLE[tag].bg, color: STORE_STYLE[tag].fg }}>
              <MapPin size={13} /> {name} near {city}
            </a>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 pt-1" style={{ borderTop: "1px dashed " + C.line }}>
          <a href="https://www.s-kaupat.fi/tuotteet/kampanjat" target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium pt-2" style={{ color: C.lake }}>
            S-kaupat weekly deals <ExternalLink size={12} />
          </a>
          <a href="https://www.k-ruoka.fi/tarjoukset" target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium pt-2" style={{ color: C.lake }}>
            K-Ruoka deals <ExternalLink size={12} />
          </a>
          <a href="https://www.lidl.fi" target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium pt-2" style={{ color: C.lake }}>
            Lidl offers <ExternalLink size={12} />
          </a>
        </div>
      </div>

      {/* this week's offers */}
      <div className="rounded-2xl p-4 flex flex-col gap-2" style={{ background: C.cloudSoft, border: "1px solid " + C.cloud }}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold flex items-center gap-2" style={{ color: C.ink }}>
            <Percent size={16} style={{ color: C.cloud }} /> This week's offers
          </p>
          <button aria-label="Refresh offers" onClick={runScan} disabled={scanning} className="rounded-full p-1">
            {scanning
              ? <Loader2 size={16} className="spin" style={{ color: C.cloud }} />
              : <RotateCcw size={16} style={{ color: C.cloud }} />}
          </button>
        </div>
        {scanning && !offers && (
          <p className="text-sm" style={{ color: C.ink }}>Scanning s-kaupat, K-Ruoka and Lidl for current discounts — takes about 20 seconds…</p>
        )}
        {scanning && offers && <p className="text-xs" style={{ color: C.sub }}>Refreshing the offer scan…</p>}
        {!scanning && scanErr && (
          <p className="text-sm" style={{ color: C.ink }}>Couldn't fetch offers right now. Tap the arrow to retry, or use the deals links above.</p>
        )}
        {!scanning && !scanErr && offers && (
          <>
            <p className="text-sm" style={{ color: C.ink }}>
              {offers.deals.length > 0
                ? <><b>{offers.deals.length} of your items</b> look discounted right now. </>
                : "No current offers matched your list. "}
              {offers.note}
            </p>
            {offers.deals.length > 0 && (
              <button onClick={applyDeals} className="self-start rounded-full px-3 py-2 text-xs font-semibold" style={{ background: C.ink, color: "#fff" }}>
                Tag {offers.deals.length} item{offers.deals.length > 1 ? "s" : ""} to their discount store
              </button>
            )}
            <p className="text-xs" style={{ color: C.sub }}>
              AI-searched from public offer pages · checked {fmtChecked(offers.checked)} · verify with the S/K price links before you shop.
            </p>
          </>
        )}
      </div>

      {/* progress + filters */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: C.ink }}>{checkedCount} of {items.length} in the basket</p>
          <button onClick={() => setGroc({ ...groc, checked: {} })}
            className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: C.sub }}>
            <RotateCcw size={12} /> reset
          </button>
        </div>
        <div className="rounded-full" style={{ height: 7, background: C.line }}>
          <div className="rounded-full" style={{ height: 7, width: (items.length ? (checkedCount / items.length) * 100 : 0) + "%", background: C.cloud, transition: "width .3s" }} />
        </div>
        <div className="flex gap-2 pt-1">
          {[["all", "All (" + items.length + ")"], ["S", "S · " + counts.S], ["K", "K · " + counts.K], ["L", "Lidl · " + counts.L]].map(([v, label]) => (
            <button key={v} onClick={() => setFilter(v)} className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{
                background: filter === v ? C.ink : C.card, color: filter === v ? "#fff" : C.sub,
                border: "1px solid " + (filter === v ? C.ink : C.line),
              }}>{label}</button>
          ))}
        </div>
        <p className="text-xs" style={{ color: C.sub }}>
          Tap the round tag on an item to assign it to a store chain (S → K → Lidl). Tap S / K links to check its live price.
        </p>
      </div>

      {/* list */}
      {GROC_CATS.map((cat) => {
        const catItems = visible.filter((g) => g.cat === cat);
        if (catItems.length === 0) return null;
        return (
          <div key={cat} className="flex flex-col gap-1">
            <p className="text-xs font-bold uppercase tracking-wide px-1" style={{ color: C.cloud }}>{cat}</p>
            <div className="rounded-2xl overflow-hidden" style={{ background: C.card, border: "1px solid " + C.line }}>
              {catItems.map((g, idx) => {
                const done = !!groc.checked[g.id];
                const assigned = groc.store[g.id];
                return (
                  <div key={g.id} className="flex items-center gap-3 px-3 py-3"
                    style={{ borderTop: idx === 0 ? "none" : "1px solid " + C.line }}>
                    <button aria-label={done ? "Uncheck" : "Check"} onClick={() => setGroc({ ...groc, checked: { ...groc.checked, [g.id]: !done } })}
                      className="flex items-center justify-center rounded-md shrink-0"
                      style={{ width: 22, height: 22, background: done ? C.cloud : "transparent", border: "2px solid " + (done ? C.cloud : C.line) }}>
                      {done && <Check size={13} color="#fff" strokeWidth={3} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: C.ink, textDecoration: done ? "line-through" : "none", opacity: done ? 0.5 : 1 }}>
                        {g.n} <span className="font-normal" style={{ color: C.sub }}>· {g.fi}</span>
                      </p>
                      <p className="text-xs" style={{ color: C.sub }}>{g.q}{g.st ? " · pantry staple — skip if you have it" : ""}</p>
                      {dealMap[g.id] && (
                        <p className="text-xs font-semibold flex items-center gap-1" style={{ color: C.cloud }}>
                          <Percent size={11} /> {{ S: "S-kaupat", K: "K-Ruoka", L: "Lidl" }[dealMap[g.id].store]}: {dealMap[g.id].deal}
                        </p>
                      )}
                    </div>
                    <button onClick={() => setGroc({ ...groc, store: { ...groc.store, [g.id]: cycle[assigned] } })}
                      aria-label="Assign store"
                      className="rounded-full text-xs font-bold shrink-0 flex items-center justify-center"
                      style={{
                        width: 26, height: 26,
                        background: assigned ? STORE_STYLE[assigned].bg : C.paper,
                        color: assigned ? STORE_STYLE[assigned].fg : C.sub,
                        border: "1px dashed " + (assigned ? "transparent" : C.line),
                      }}>
                      {assigned || "–"}
                    </button>
                    <div className="flex gap-1 shrink-0">
                      <a href={sLink(g.fi)} target="_blank" rel="noreferrer" aria-label={"Price at S-kaupat: " + g.n}
                        className="rounded-md text-xs font-bold flex items-center justify-center"
                        style={{ width: 24, height: 24, background: STORE_STYLE.S.bg, color: STORE_STYLE.S.fg }}>S</a>
                      <a href={kLink(g.fi)} target="_blank" rel="noreferrer" aria-label={"Price at K-Ruoka: " + g.n}
                        className="rounded-md text-xs font-bold flex items-center justify-center"
                        style={{ width: 24, height: 24, background: STORE_STYLE.K.bg, color: STORE_STYLE.K.fg }}>K</a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────── auth ─────────────────────────── */
function AuthView({ onAuthed }) {
  const [mode, setMode] = useState("in"); // in | up
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(""); setNote("");
    const e = email.trim().toLowerCase();
    if (!e.includes("@") || e.length < 5) { setErr("Enter a valid email address."); return; }
    if (pw.length < 6) { setErr("Password needs at least 6 characters."); return; }
    setBusy(true);
    const users = (await store.get("users")) || {};
    if (mode === "in") {
      const u = users[e];
      if (!u) { setErr("No account with that email — create one below."); setBusy(false); return; }
      const hash = await sha256(u.salt + pw);
      if (hash !== u.hash) { setErr("Wrong password — try again."); setBusy(false); return; }
    } else {
      if (users[e]) { setErr("That email already has an account — sign in instead."); setBusy(false); return; }
      const salt = randSalt();
      users[e] = { salt, hash: await sha256(salt + pw), created: Date.now() };
      await store.set("users", users);
    }
    await store.set("session", { email: e });
    setBusy(false);
    onAuthed(e);
  };
  const onKey = (ev) => { if (ev.key === "Enter") submit(); };
  const inputCls = "w-full rounded-xl px-3 py-3 text-sm outline-none";
  const inputSt = { background: C.paper, color: C.ink, border: "1px solid " + C.line };

  return (
    <div className="min-h-screen flex flex-col items-center px-4 pt-10 pb-10" style={{ background: C.paper }}>
      <div className="flex items-center gap-2 mb-8">
        <Sprout size={22} style={{ color: C.cloud }} />
        <span className="disp font-extrabold" style={{ fontSize: 24, color: C.cloud }}>Vire</span>
      </div>

      <div className="w-full max-w-md rounded-3xl p-6 flex flex-col gap-4" style={{ background: C.card, border: "1px solid " + C.line }}>
        <div className="text-center">
          <h1 className="disp font-bold" style={{ fontSize: 24, color: C.ink }}>
            {mode === "in" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-sm mt-1" style={{ color: C.sub }}>
            {mode === "in" ? "Your week of healthy eating is waiting." : "A week of good food starts here."}
          </p>
        </div>

        <label className="flex flex-col gap-1 text-sm font-medium" style={{ color: C.ink }}>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={onKey}
            placeholder="you@example.com" autoComplete="email" className={inputCls} style={inputSt} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium" style={{ color: C.ink }}>
          Password
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={onKey}
            placeholder="At least 6 characters" autoComplete={mode === "in" ? "current-password" : "new-password"}
            className={inputCls} style={inputSt} />
        </label>

        {err && <p className="text-sm font-medium" style={{ color: C.berry }}>{err}</p>}

        <button onClick={submit} disabled={busy}
          className="w-full rounded-full py-3 font-semibold text-sm flex items-center justify-center gap-2"
          style={{ background: C.ink, color: "#fff", opacity: busy ? 0.7 : 1 }}>
          {busy && <Loader2 size={16} className="spin" />}
          {mode === "in" ? "Sign in" : "Create account"}
        </button>

        <div className="flex items-center gap-3">
          <span className="flex-1" style={{ height: 1, background: C.line }} />
          <span className="text-xs" style={{ color: C.sub }}>or</span>
          <span className="flex-1" style={{ height: 1, background: C.line }} />
        </div>

        <button onClick={() => setNote("Google sign-in needs the hosted backend — it arrives with the iOS/web release. Email works today, right on this device.")}
          className="w-full rounded-full py-3 font-semibold text-sm flex items-center justify-center gap-2"
          style={{ background: C.paper, color: C.ink, border: "1px solid " + C.line }}>
          <span className="disp font-extrabold" style={{ color: "#4285F4" }}>G</span> Continue with Google
        </button>

        {note && <p className="text-xs" style={{ color: C.sub }}>{note}</p>}

        <div className="text-center flex flex-col gap-1 pt-1">
          {mode === "in" && (
            <button onClick={() => setNote("Preview accounts live only in this app's storage, so there's no email reset yet — create a new account if the password is lost.")}
              className="text-sm font-medium" style={{ color: C.lake }}>
              Forgot your password?
            </button>
          )}
          <p className="text-sm" style={{ color: C.sub }}>
            {mode === "in" ? "New here? " : "Have an account? "}
            <button onClick={() => { setMode(mode === "in" ? "up" : "in"); setErr(""); setNote(""); }}
              className="font-semibold" style={{ color: C.lake }}>
              {mode === "in" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </div>

      <p className="text-xs mt-6 max-w-md text-center" style={{ color: C.sub }}>
        Preview build: accounts and data live in this app's own storage on your Claude account. Cloud sync and Google sign-in come with the hosted version.
      </p>
    </div>
  );
}

/* ─────────────────────────── settings / profile ─────────────────────────── */
const Field = ({ label, children }) => (
  <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide" style={{ color: C.sub }}>
    {label}{children}
  </label>
);
const inputStyle = { background: C.paper, color: C.ink, border: "1px solid " + C.line };
const DEFAULT_PROFILE = { name: "", sex: "f", age: 35, h: 170, w: 80, goalW: 72, act: 1.375, pace: 500, city: "Helsinki", allergies: "", waterMl: 2000 };

function SettingsPage({ initial, firstRun, hasPlan, onSave, onClose, onSignOut, onRegenerate }) {
  const [f, setF] = useState({ ...DEFAULT_PROFILE, ...(initial || {}) });
  const [confirmRegen, setConfirmRegen] = useState(false);
  const preview = calcTarget(f);
  const num = (key, val) => setF({ ...f, [key]: Math.max(0, parseInt(val || "0", 10)) });
  const inputCls = "rounded-xl px-3 py-2 text-sm font-normal normal-case outline-none";

  return (
    <div className="fixed inset-0 overflow-y-auto" style={{ background: C.paper, zIndex: 50 }}>
      <div className="max-w-md mx-auto px-4 py-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="disp font-extrabold" style={{ fontSize: 22, color: C.ink }}>
            {firstRun ? "Tell Vire about you" : "Settings"}
          </h1>
          {!firstRun && (
            <button aria-label="Close settings" onClick={onClose} className="rounded-full p-2" style={{ background: C.card, border: "1px solid " + C.line }}>
              <X size={17} style={{ color: C.ink }} />
            </button>
          )}
        </div>
        {firstRun && (
          <p className="text-sm" style={{ color: C.sub }}>
            A minute of setup so the calorie budget and the week's food are actually yours.
          </p>
        )}

        {/* You */}
        <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: C.card, border: "1px solid " + C.line }}>
          <h2 className="disp font-bold" style={{ fontSize: 17, color: C.ink }}>You</h2>
          <Field label="Name">
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="How should Vire greet you?"
              className={inputCls} style={inputStyle} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Age">
              <input type="number" value={f.age} onChange={(e) => num("age", e.target.value)} className={inputCls} style={inputStyle} />
            </Field>
            <Field label="Height (cm)">
              <input type="number" value={f.h} onChange={(e) => num("h", e.target.value)} className={inputCls} style={inputStyle} />
            </Field>
            <Field label="Weight (kg)">
              <input type="number" value={f.w} onChange={(e) => num("w", e.target.value)} className={inputCls} style={inputStyle} />
            </Field>
            <Field label="Goal weight (kg)">
              <input type="number" value={f.goalW} onChange={(e) => num("goalW", e.target.value)} className={inputCls} style={inputStyle} />
            </Field>
          </div>
          <Field label="Sex">
            <select value={f.sex} onChange={(e) => setF({ ...f, sex: e.target.value })} className={inputCls} style={inputStyle}>
              <option value="f">Female</option>
              <option value="m">Male</option>
            </select>
          </Field>
          <Field label="Activity level (outside workouts)">
            <select value={f.act} onChange={(e) => setF({ ...f, act: parseFloat(e.target.value) })} className={inputCls} style={inputStyle}>
              <option value={1.2}>Mostly sitting</option>
              <option value={1.375}>Lightly active</option>
              <option value={1.55}>Moderately active</option>
              <option value={1.725}>Very active</option>
            </select>
          </Field>
          <Field label="Weight-loss pace">
            <select value={f.pace} onChange={(e) => setF({ ...f, pace: parseInt(e.target.value, 10) })} className={inputCls} style={inputStyle}>
              <option value={250}>Gentle (≈ ¼ kg / week)</option>
              <option value={500}>Steady (≈ ½ kg / week)</option>
              <option value={750}>Faster (≈ ¾ kg / week)</option>
            </select>
          </Field>
        </div>

        {/* Food & shopping */}
        <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: C.card, border: "1px solid " + C.line }}>
          <h2 className="disp font-bold" style={{ fontSize: 17, color: C.ink }}>Food & shopping</h2>
          <Field label="City">
            <select value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} className={inputCls} style={inputStyle}>
              {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Allergies">
            <input value={f.allergies} onChange={(e) => setF({ ...f, allergies: e.target.value })} placeholder="e.g. peanuts, shellfish"
              className={inputCls} style={inputStyle} />
          </Field>
          <p className="text-xs" style={{ color: C.sub, marginTop: -6 }}>
            Generated plans exclude these — but always double-check product labels; don't rely on this alone for severe allergies.
          </p>
          <Field label="Water goal (ml)">
            <input type="number" value={f.waterMl} onChange={(e) => num("waterMl", e.target.value)} className={inputCls} style={inputStyle} />
          </Field>
        </div>

        {/* target */}
        <div className="rounded-2xl p-4" style={{ background: C.cloudSoft }}>
          <p className="text-sm font-medium" style={{ color: C.ink }}>{firstRun ? "Your daily target" : "New daily target"}</p>
          <p className="disp font-extrabold" style={{ color: C.cloud, fontSize: 26 }}>{preview} kcal</p>
          {f.goalW > 0 && f.goalW < f.w && (
            <p className="text-xs mt-1" style={{ color: C.sub }}>On the way from {f.w} kg to {f.goalW} kg.</p>
          )}
        </div>

        <button onClick={() => onSave({ ...f, target: preview })}
          className="rounded-full py-3 font-semibold text-sm" style={{ background: C.ink, color: "#fff" }}>
          {firstRun ? "Save and continue" : "Save changes"}
        </button>

        {!firstRun && hasPlan && (
          <div className="rounded-2xl p-4 flex flex-col gap-2" style={{ background: C.card, border: "1px solid " + C.line }}>
            <h2 className="disp font-bold" style={{ fontSize: 17, color: C.ink }}>Weekly plan</h2>
            <p className="text-sm" style={{ color: C.sub }}>Regenerate if your goals changed or you want different meals.</p>
            <button onClick={() => { if (confirmRegen) { onRegenerate(); } else { setConfirmRegen(true); } }}
              className="self-start rounded-full px-4 py-2 font-semibold text-sm flex items-center gap-2"
              style={{ background: confirmRegen ? C.berry : C.ink, color: "#fff" }}>
              <Sparkles size={15} /> {confirmRegen ? "Tap again to confirm" : "Generate my week plan"}
            </button>
            <p className="text-xs flex items-center gap-1" style={{ color: C.sub }}>
              <Sparkles size={11} /> This replaces the current week's meals and grocery list.
            </p>
          </div>
        )}

        <button onClick={onSignOut}
          className="rounded-full py-3 font-semibold text-sm flex items-center justify-center gap-2"
          style={{ background: C.card, color: C.ink, border: "1px solid " + C.line }}>
          <LogOut size={16} /> Sign out
        </button>

        <p className="text-xs pb-4" style={{ color: C.sub }}>
          The target uses the Mifflin-St Jeor estimate with a safe minimum. For the cholesterol side, it's worth sanity-checking your goals with your doctor.
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────── plan gate ─────────────────────────── */
function PlanGate({ settings, onPlan }) {
  const [phase, setPhase] = useState("idle"); // idle | gen | error
  const [dayState, setDayState] = useState(Array(7).fill("wait"));

  const start = async () => {
    setPhase("gen");
    setDayState(Array(7).fill("run"));
    try {
      const plan = await generatePlan(settings, (i, s) =>
        setDayState((d) => { const c = [...d]; c[i] = s; return c; })
      );
      onPlan(plan);
    } catch (e) { setPhase("error"); }
  };
  const useStarter = () => onPlan({ v: 1, created: Date.now(), starter: true, days: STARTER, groc: STARTER_GROC });
  const hasAllergies = settings.allergies && settings.allergies.trim().length > 0;

  return (
    <div className="flex flex-col items-center text-center gap-4 pt-8">
      <span className="rounded-full flex items-center justify-center" style={{ width: 74, height: 74, background: C.cloudSoft }}>
        <Sparkles size={30} style={{ color: C.cloud }} />
      </span>
      <h1 className="disp font-extrabold" style={{ fontSize: 26, color: C.ink }}>No plan for this week yet</h1>
      <p className="text-sm max-w-xs" style={{ color: C.sub }}>
        In about 30 seconds you'll get 7 days of cholesterol-friendly meals{hasAllergies ? " (avoiding " + settings.allergies.trim() + ")" : ""}, an exercise schedule and a full grocery list with links to Finnish store prices.
      </p>

      {phase === "idle" && (
        <>
          <button onClick={start}
            className="rounded-full px-5 py-3 font-semibold text-sm flex items-center gap-2"
            style={{ background: C.ink, color: "#fff" }}>
            <Sparkles size={16} /> Generate my week plan
          </button>
          <button onClick={useStarter} className="text-sm font-medium" style={{ color: C.sub }}>
            or start with the built-in Finnish starter plan{hasAllergies ? " (not adjusted for your allergies)" : ""}
          </button>
        </>
      )}

      {phase === "gen" && (
        <div className="w-full max-w-xs rounded-2xl p-4 flex flex-col gap-2 text-left" style={{ background: C.card, border: "1px solid " + C.line }}>
          {DAY_NAMES.map((d, i) => (
            <div key={d} className="flex items-center justify-between text-sm" style={{ color: C.ink }}>
              <span>{d}</span>
              {dayState[i] === "done" && <Check size={16} style={{ color: C.cloud }} />}
              {dayState[i] === "fail" && <X size={16} style={{ color: C.berry }} />}
              {dayState[i] === "run" && <Loader2 size={15} className="spin" style={{ color: C.cloud }} />}
              {dayState[i] === "wait" && <span className="text-xs" style={{ color: C.sub }}>…</span>}
            </div>
          ))}
          <p className="text-xs pt-1" style={{ color: C.sub, borderTop: "1px dashed " + C.line }}>
            Cooking up your week — the grocery list assembles itself right after.
          </p>
        </div>
      )}

      {phase === "error" && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm max-w-xs" style={{ color: C.berry }}>
            Some days didn't come back right — it happens. Try again, or start from the built-in plan.
          </p>
          <button onClick={start} className="rounded-full px-5 py-3 font-semibold text-sm" style={{ background: C.ink, color: "#fff" }}>
            Try again
          </button>
          <button onClick={useStarter} className="text-sm font-medium" style={{ color: C.sub }}>
            Use the starter plan instead{hasAllergies ? " (not adjusted for your allergies)" : ""}
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── app shell ─────────────────────────── */
export default function VireApp() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(null);        // email
  const [userReady, setUserReady] = useState(false);
  const [legacyPrefill, setLegacyPrefill] = useState(null);

  const [tab, setTab] = useState("now");
  const [now, setNow] = useState(new Date());
  const [settings, setSettings] = useState(null);
  const [plan, setPlan] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [log, setLog] = useState(emptyLog());
  const [groc, setGroc] = useState({ checked: {}, store: {} });
  const loaded = useRef(false);
  const logDk = useRef(null);

  const wd = weekdayIdx(now);
  const dk = dateKey(now);
  const P = user ? userPrefix(user) : null;

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  /* restore session */
  useEffect(() => {
    (async () => {
      const [sess, users] = await Promise.all([store.get("session"), store.get("users")]);
      if (sess && sess.email && users && users[sess.email]) setUser(sess.email);
      setAuthReady(true);
    })();
  }, []);

  /* load this user's data */
  useEffect(() => {
    if (!user) return;
    loaded.current = false;
    setUserReady(false);
    (async () => {
      const p = userPrefix(user);
      const [s, pl, l, g, legacy] = await Promise.all([
        store.get(p + "settings"), store.get(p + "plan"), store.get(p + "log:" + dk),
        store.get(p + "grocery"), store.get("settings"),
      ]);
      setSettings(s || null);
      setPlan(pl || null);
      setLog(l ? { ...emptyLog(), ...l } : emptyLog());
      setGroc(g ? { checked: {}, store: {}, ...g } : { checked: {}, store: {} });
      setLegacyPrefill(!s && legacy ? legacy : null);
      logDk.current = dk;
      loaded.current = true;
      setUserReady(true);
      setTab("now");
      setShowSettings(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  /* new day while the app is open */
  useEffect(() => {
    if (!loaded.current || !P || logDk.current === dk) return;
    (async () => {
      const l = await store.get(P + "log:" + dk);
      setLog(l ? { ...emptyLog(), ...l } : emptyLog());
      logDk.current = dk;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dk]);

  useEffect(() => { if (loaded.current && P && logDk.current === dk) store.set(P + "log:" + dk, log); }, [log, dk, P]);
  useEffect(() => { if (loaded.current && P) store.set(P + "grocery", groc); }, [groc, P]);
  useEffect(() => { if (loaded.current && P && settings) store.set(P + "settings", settings); }, [settings, P]);

  const target = settings ? settings.target : 1600;
  const waterGoal = settings ? Math.max(4, Math.round((settings.waterMl || 2000) / 250)) : 8;
  const firstName = settings && settings.name ? settings.name.trim().split(" ")[0] : "";

  const handlePlan = (pl) => {
    setPlan(pl);
    setGroc({ checked: {}, store: {} });
    if (P) {
      store.set(P + "plan", pl);
      store.set(P + "grocery", { checked: {}, store: {} });
      store.set(P + "offers", null);
    }
  };
  const signOut = async () => {
    await store.set("session", null);
    setUser(null); setSettings(null); setPlan(null);
    setLog(emptyLog()); setGroc({ checked: {}, store: {} });
    setShowSettings(false); setUserReady(false);
  };

  if (!authReady || (user && !userReady)) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.paper }}>
        <style>{BASE_CSS}</style>
        <p className="disp font-bold" style={{ color: C.cloud, fontSize: 20 }}>Vire</p>
      </div>
    );
  }

  if (!user) {
    return (<><style>{BASE_CSS}</style><AuthView onAuthed={(e) => setUser(e)} /></>);
  }

  const NAV = [
    { id: "now", label: "Now", Icon: Clock },
    { id: "today", label: "Today", Icon: Sun },
    { id: "week", label: "Week", Icon: CalendarDays },
    { id: "shop", label: "Shop", Icon: ShoppingBasket },
  ];
  const firstRun = !settings;

  return (
    <div className="min-h-screen" style={{ background: C.paper, fontFamily: "'Instrument Sans', system-ui, sans-serif" }}>
      <style>{BASE_CSS}</style>

      <div className="max-w-md mx-auto px-4 pb-28 pt-5">
        <header className="flex items-center justify-between mb-5">
          <div className="flex items-baseline gap-2">
            <span className="disp font-extrabold" style={{ fontSize: 21, color: C.cloud }}>Vire</span>
            <span className="text-xs" style={{ color: C.sub }}>food · water · movement</span>
          </div>
          <button aria-label="Settings" onClick={() => setShowSettings(true)} className="rounded-full p-2" style={{ background: C.card, border: "1px solid " + C.line }}>
            <Settings size={17} style={{ color: C.ink }} />
          </button>
        </header>

        {!firstRun && !plan && <PlanGate settings={settings} onPlan={handlePlan} />}

        {!firstRun && plan && tab === "now" && (
          <NowView now={now} wd={wd} days={plan.days} log={log} setLog={setLog}
            target={target} waterGoal={waterGoal} firstName={firstName} goToday={() => setTab("today")} />
        )}
        {!firstRun && plan && tab === "today" && (
          <TodayView now={now} wd={wd} days={plan.days} log={log} setLog={setLog} target={target} waterGoal={waterGoal} />
        )}
        {!firstRun && plan && tab === "week" && <WeekView wd={wd} days={plan.days} starter={plan.starter} />}
        {!firstRun && plan && tab === "shop" && (
          <GroceriesView items={plan.groc} groc={groc} setGroc={setGroc}
            city={settings.city || "Helsinki"} onCity={(c) => setSettings({ ...settings, city: c })}
            okey={P + "offers"} />
        )}
      </div>

      {!firstRun && plan && (
        <nav className="fixed bottom-0 left-0 right-0" style={{ background: "rgba(255,255,255,0.96)", borderTop: "1px solid " + C.line, backdropFilter: "blur(8px)" }}>
          <div className="max-w-md mx-auto grid grid-cols-4">
            {NAV.map(({ id, label, Icon }) => {
              const active = tab === id;
              return (
                <button key={id} onClick={() => setTab(id)} className="flex flex-col items-center gap-1 py-3" aria-current={active ? "page" : undefined}>
                  <Icon size={20} style={{ color: active ? C.cloud : C.sub }} />
                  <span className="text-xs font-semibold" style={{ color: active ? C.cloud : C.sub }}>{label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {(showSettings || firstRun) && (
        <SettingsPage
          initial={settings || legacyPrefill}
          firstRun={firstRun}
          hasPlan={!!plan}
          onClose={() => setShowSettings(false)}
          onSignOut={signOut}
          onRegenerate={() => { setShowSettings(false); setPlan(null); if (P) { store.set(P + "plan", null); store.set(P + "offers", null); } }}
          onSave={(s) => { setSettings(s); setShowSettings(false); }}
        />
      )}
    </div>
  );
}

const BASE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600&display=swap');
  .disp { font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; letter-spacing: -0.01em; }
  body { font-family: 'Instrument Sans', system-ui, sans-serif; }
  button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, [role="checkbox"]:focus-visible { outline: 2px solid ${C.cloud}; outline-offset: 2px; border-radius: 8px; }
  @keyframes vpulse { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.35); opacity: .75 } }
  .pulse { animation: vpulse 2.2s ease-in-out infinite; }
  @keyframes vspin { to { transform: rotate(360deg); } }
  .spin { animation: vspin 1s linear infinite; }
  input[type=number]::-webkit-inner-spin-button { opacity: 1; }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
`;
