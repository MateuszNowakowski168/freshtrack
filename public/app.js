const STORAGE_KEY = "freshtrack.products.v1";
const USED_KEY = "freshtrack.usedCount.v1";
const $ = (id) => document.getElementById(id);
let products = loadProducts();
let currentView = "all";
let toastTimer;

const categoryEmoji = {
  "Nabiał": "🥛", "Owoce i warzywa": "🥑", "Mięso i ryby": "🐟",
  "Pieczywo": "🍞", "Produkty suche": "🌾", "Mrożonki": "🧊",
  "Napoje": "🧃", "Inne": "🥫"
};
const viewTitles = {
  all: ["Wszystkie produkty", "Miej terminy pod kontrolą i marnuj mniej.", "Twoje produkty", "Najbliższe terminy na samej górze."],
  soon: ["Do zużycia wkrótce", "Te produkty warto zaplanować na najbliższe dni.", "Zużyj w pierwszej kolejności", "Produkty z terminem w ciągu 3 dni."],
  expired: ["Po terminie", "Sprawdź te produkty i oceń je przed użyciem.", "Produkty po terminie", "Data minęła — sprawdź etykietę i stan produktu."],
  used: ["Zużyte produkty", "Dobra robota — wykorzystane produkty nie muszą się zmarnować.", "Historia zużycia", "Produkty oznaczone przez Ciebie jako zużyte."],
  recipes: ["Przepisy", "Pomysły na dania z produktów, które warto zużyć.", "", ""]
};
const recipeCatalog = [
  {
    title: "Omlet z lodówkowymi dodatkami",
    sourceTitle: "From-the-fridge omelette",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/fridge-omelette",
    imageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/recipe-image-legacy-id-25505_11-a0eea66.jpg?resize=900%2C470",
    time: "15 min",
    ingredients: [
      { name: "Jajka", keys: ["jajko", "jajka", "jajek"] },
      { name: "Cukinia", keys: ["cukinia", "cukinie"] },
      { name: "Groszek", keys: ["groszek", "groszku"] },
      { name: "Ser", keys: ["ser", "feta", "cheddar", "mozzarella", "gouda", "twarog"] }
    ],
    steps: [
      "Pokrój cukinię i podsmaż ją krótko na patelni.",
      "Dodaj groszek, wlej roztrzepane jajka i posyp serem.",
      "Smaż na małym ogniu, aż jajka się zetną."
    ]
  },
  {
    title: "Omlet z pomidorami i fetą",
    sourceTitle: "Feta & semi-dried tomato omelette",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/feta-semi-dried-tomato-omelette",
    imageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/recipe-image-legacy-id-1201564_11-feaae3c.jpg?resize=900%2C470",
    time: "10 min",
    ingredients: [
      { name: "Jajka", keys: ["jajko", "jajka", "jajek"] },
      { name: "Pomidory", keys: ["pomidor", "pomidory", "pomidorow"] },
      { name: "Ser feta", keys: ["feta"] }
    ],
    steps: [
      "Roztrzep jajka i wlej je na lekko natłuszczoną, rozgrzaną patelnię.",
      "Gdy omlet zacznie się ścinać, dodaj pokrojone pomidory i pokruszoną fetę.",
      "Złóż omlet na pół i dosmaż przez chwilę."
    ]
  },
  {
    title: "Omlet serowy",
    sourceTitle: "Cheese omelette",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/cheese-omelette",
    imageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2024/01/Cheese-omelette-45155e3.jpg?resize=900%2C470",
    time: "10 min",
    ingredients: [
      { name: "Jajka", keys: ["jajko", "jajka", "jajek"] },
      { name: "Ser", keys: ["ser", "feta", "cheddar", "mozzarella", "gouda", "twarog"] }
    ],
    steps: [
      "Roztrzep jajka i wlej na patelnię z odrobiną tłuszczu.",
      "Smaż na małym ogniu, delikatnie zgarniając ścinające się jajka do środka.",
      "Posyp serem, złóż omlet i podawaj, gdy ser się rozpuści."
    ]
  },
  {
    title: "Placuszki bananowe z jajkiem",
    sourceTitle: "Gluten-free banana pancakes",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/banana-pancakes",
    imageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/banana-pancakes-6cfd286.jpg?resize=900%2C470",
    time: "10 min",
    ingredients: [
      { name: "Banan", keys: ["banan", "banany", "banana"] },
      { name: "Jajka", keys: ["jajko", "jajka", "jajek"] }
    ],
    steps: [
      "Rozgnieć dojrzałego banana i wymieszaj z roztrzepanymi jajkami.",
      "Nakładaj małe porcje ciasta na lekko natłuszczoną, rozgrzaną patelnię.",
      "Smaż placuszki po 1–2 minuty z każdej strony."
    ]
  },
  {
    title: "Hiszpański omlet ze szpinakiem",
    sourceTitle: "Spanish spinach omelette",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/spanish-spinach-omelette",
    imageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/recipe-image-legacy-id-217452_12-d62e2dc.jpg?resize=900%2C470",
    time: "30 min",
    ingredients: [
      { name: "Szpinak", keys: ["szpinak"] },
      { name: "Jajka", keys: ["jajko", "jajka", "jajek"] },
      { name: "Ziemniaki", keys: ["ziemniak", "ziemniaki", "ziemniakow"] },
      { name: "Cebula", keys: ["cebula", "cebule"] }
    ],
    steps: [
      "Podduś pokrojoną cebulę i ziemniaki, aż ziemniaki zmiękną.",
      "Dodaj szpinak, a następnie wlej roztrzepane jajka.",
      "Smaż na małym ogniu i dopiecz wierzch, aż omlet całkowicie się zetnie."
    ]
  },
  {
    title: "Zupa krem z groszku i ziemniaków",
    sourceTitle: "Minty pea & potato soup",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/minty-pea-potato-soup",
    imageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/recipe-image-legacy-id-488594_10-bcbf7c7.jpg?resize=900%2C470",
    time: "30 min",
    ingredients: [
      { name: "Ziemniaki", keys: ["ziemniak", "ziemniaki", "ziemniakow"] },
      { name: "Groszek", keys: ["groszek", "groszku"] },
      { name: "Cebula", keys: ["cebula", "cebule"] }
    ],
    steps: [
      "Podsmaż cebulę, dodaj pokrojone ziemniaki i bulion, a następnie gotuj do miękkości.",
      "Pod koniec gotowania dorzuć groszek i krótko podgrzej.",
      "Zmiksuj część lub całość zupy; dopraw i podawaj."
    ]
  },
  {
    title: "Curry z kalafiora i ziemniaków",
    sourceTitle: "Cauliflower & potato curry",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/cauliflower-potato-curry",
    imageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/recipe-image-legacy-id-265459_12-80c2f4b.jpg?resize=900%2C470",
    time: "55 min",
    ingredients: [
      { name: "Kalafior", keys: ["kalafior"] },
      { name: "Ziemniaki", keys: ["ziemniak", "ziemniaki", "ziemniakow"] },
      { name: "Pomidory", keys: ["pomidor", "pomidory", "pomidorow"] },
      { name: "Cebula", keys: ["cebula", "cebule"] }
    ],
    steps: [
      "Podsmaż cebulę, dodaj przyprawy i krótko wymieszaj.",
      "Dodaj pomidory, kawałki kalafiora i ziemniaków oraz odrobinę wody.",
      "Duś pod przykryciem, aż warzywa będą miękkie; dopraw do smaku."
    ]
  },
  {
    title: "Kurczak pieczony z ziemniakami",
    sourceTitle: "Curried chicken & new potato traybake",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/curried-chicken-new-potato-traybake",
    imageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/curried-chicken-new-potato-traybake-5eefa13.jpg?resize=900%2C470",
    time: "ok. 1 godz. 30 min",
    ingredients: [
      { name: "Kurczak", keys: ["kurczak", "kurczaka", "podudzia"] },
      { name: "Ziemniaki", keys: ["ziemniak", "ziemniaki", "ziemniakow"] },
      { name: "Pomidory", keys: ["pomidor", "pomidory", "pomidorow"] },
      { name: "Jogurt", keys: ["jogurt", "jogurtu"] }
    ],
    steps: [
      "Natrzyj kurczaka jogurtem, olejem i przyprawami, po czym odstaw na co najmniej 30 minut.",
      "Ułóż kurczaka z ziemniakami w naczyniu i piecz w 180°C przez 40–45 minut, aż mięso będzie w pełni upieczone.",
      "Pod koniec dodaj pomidory; podawaj z jogurtem."
    ]
  },
  {
    title: "Tarta z porami, serem i ziemniakami",
    sourceTitle: "Cheesy leek & potato pie",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/cheesy-leek-potato-pie-0",
    imageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/recipe-image-legacy-id-1508_12-89261e9.jpg?resize=900%2C470",
    time: "ok. 1 godz. 10 min",
    ingredients: [
      { name: "Pory", keys: ["por", "pory", "pora", "porow"] },
      { name: "Ziemniaki", keys: ["ziemniak", "ziemniaki", "ziemniakow"] },
      { name: "Ser", keys: ["ser", "feta", "cheddar", "mozzarella", "gouda", "twarog"] },
      { name: "Jajko", keys: ["jajko", "jajka", "jajek"] }
    ],
    steps: [
      "Duś pory z masłem i ziołami, aż zmiękną. Ugotuj krótko ziemniaki i dodaj je do porów.",
      "Po przestudzeniu wymieszaj farsz z serem i wyłóż na ciasto francuskie lub kruche.",
      "Zamknij brzegi ciasta, posmaruj jajkiem i piecz w 200°C, aż tarta się zarumieni."
    ]
  },
  {
    title: "Makaron zapiekany z łososiem i brokułami",
    sourceTitle: "Salmon & broccoli pasta",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/italian-broccoli-salmon-bake",
    imageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2010/03/Broccoli-salmon-pasta-62c75fe.jpg?resize=900%2C470",
    time: "ok. 1 godz. 5 min",
    ingredients: [
      { name: "Łosoś", keys: ["losos", "lososia", "lososiem"] },
      { name: "Brokuły", keys: ["brokul", "brokuly", "brokulow"] },
      { name: "Mleko", keys: ["mleko"] },
      { name: "Ser", keys: ["ser", "feta", "cheddar", "mozzarella", "gouda", "twarog"] }
    ],
    steps: [
      "Ugotuj makaron, a pod koniec gotowania dodaj brokuły i odcedź.",
      "Zagotuj mleko z masłem i mąką, mieszając do uzyskania gładkiego sosu. Dodaj ser i warzywa.",
      "Ułóż łososia w naczyniu, przykryj sosem z makaronem i brokułami, a następnie zapiekaj w 190°C przez około 30 minut."
    ]
  },
  {
    title: "Łosoś z kremowymi porami i ziemniakami",
    sourceTitle: "Creamy salmon, leek & potato traybake",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/creamy-salmon-leek-potato-traybake",
    imageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/creamy-salmon-leek-potato-traybake-367b3ff.jpg?resize=900%2C470",
    time: "40 min",
    ingredients: [
      { name: "Łosoś", keys: ["losos", "lososia", "lososiem"] },
      { name: "Pory", keys: ["por", "pory", "pora", "porow"] },
      { name: "Ziemniaki", keys: ["ziemniak", "ziemniaki", "ziemniakow"] },
      { name: "Śmietanka", keys: ["smietana", "smietanke", "smietanka"] }
    ],
    steps: [
      "Ugotuj ziemniaki przez kilka minut, odcedź i zapiecz z oliwą przez 20 minut w 200°C.",
      "Podsmaż pory, dodaj czosnek, śmietankę i kapary, po czym krótko zagotuj.",
      "Polej ziemniaki sosem, ułóż na wierzchu łososia i zapiekaj pod grillem, aż ryba będzie gotowa."
    ]
  },
  {
    title: "Risotto z pieczarkami",
    sourceTitle: "Mushroom risotto",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/mushroom-risotto",
    imageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/recipe-image-legacy-id-52074_11-ca58d45.jpg?resize=900%2C470",
    time: "ok. 50 min",
    ingredients: [
      { name: "Grzyby", keys: ["pieczarka", "pieczarki", "grzyby", "grzyb"] },
      { name: "Cebula", keys: ["cebula", "cebule"] },
      { name: "Czosnek", keys: ["czosnek"] },
      { name: "Ryż", keys: ["ryz", "arborio"] },
      { name: "Parmezan lub ser", keys: ["parmezan", "ser", "gouda", "cheddar"] }
    ],
    steps: [
      "Namocz suszone grzyby, a następnie użyj aromatycznej wody jako części bulionu.",
      "Podsmaż cebulę, czosnek i świeże grzyby; wsyp ryż i stopniowo dolewaj gorący bulion, mieszając.",
      "Gdy ryż będzie miękki, dodaj masło i starty parmezan."
    ]
  },
  {
    title: "Chili warzywne z fasolą",
    sourceTitle: "Veggie chilli",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/veggie-chilli",
    imageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/veggie-chilli-4a57c04.jpg?resize=900%2C470",
    time: "ok. 30 min",
    ingredients: [
      { name: "Warzywa", keys: ["papryka", "cukinia", "marchew", "warzywa"] },
      { name: "Fasola", keys: ["fasola", "fasole", "fasoli"] },
      { name: "Pomidory", keys: ["pomidor", "pomidory", "pomidorow"] },
      { name: "Kasza lub ryż", keys: ["kasza", "ryz", "komosa"] }
    ],
    steps: [
      "Podpiecz pokrojone warzywa w naczyniu żaroodpornym.",
      "Dodaj fasolę i pomidory, dopraw chili oraz gotuj, aż danie będzie gorące i aromatyczne.",
      "Podawaj z ugotowaną kaszą lub ryżem."
    ]
  },
  {
    title: "Chlebek bananowy",
    sourceTitle: "Banana bread",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/brilliant-banana-loaf",
    imageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2020/06/recipe-image-legacy-id-1273522_8-a6b9246.jpg?resize=900%2C470",
    time: "ok. 1 godz. 5 min",
    ingredients: [
      { name: "Banany", keys: ["banan", "banany", "banana"] },
      { name: "Jajka", keys: ["jajko", "jajka", "jajek"] },
      { name: "Masło", keys: ["maslo", "masła"] },
      { name: "Mąka", keys: ["maka", "mąka"] },
      { name: "Cukier", keys: ["cukier"] }
    ],
    steps: [
      "Utrzyj miękkie masło z cukrem, a następnie stopniowo dodaj roztrzepane jajka.",
      "Wsyp mąkę z proszkiem do pieczenia i delikatnie wmieszaj rozgniecione banany.",
      "Przełóż ciasto do foremki i piecz w 180°C, aż patyczek wbity w środek będzie suchy."
    ]
  }
];

function localISODate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function loadProducts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function saveProducts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
}
function daysUntil(dateString) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const date = new Date(`${dateString}T00:00:00`);
  return Math.round((date - today) / 86400000);
}
function getStatus(product) {
  if (product.used) return { key: "used", label: "Zużyty", className: "used" };
  const days = daysUntil(product.date);
  if (days < 0) return { key: "expired", label: `${Math.abs(days)} dni po terminie`, className: "expired" };
  if (days === 0) return { key: "soon", label: "Do zużycia dziś", className: "soon" };
  if (days <= 3) return { key: "soon", label: days === 1 ? "Jutro" : `Za ${days} dni`, className: "soon" };
  return { key: "fresh", label: "W terminie", className: "fresh" };
}
function formatDate(dateString) {
  if (!dateString) return "—";
  const [y, m, d] = dateString.split("-");
  return `${d}.${m}.${y}`;
}
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function normalizeText(value) {
  return String(value ?? "").toLocaleLowerCase("pl").replace(/ł/g, "l").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function productMatchesIngredient(product, ingredient) {
  const words = normalizeText(product.name).split(/[^a-z0-9]+/).filter(Boolean);
  return ingredient.keys.some(key => {
    const keyWords = normalizeText(key).split(/[^a-z0-9]+/).filter(Boolean);
    return keyWords.every(word => words.includes(word));
  });
}
function recipeSuggestions() {
  const usableProducts = products.filter(product => !product.used && daysUntil(product.date) >= 0);
  return recipeCatalog.map(recipe => {
    const ingredients = recipe.ingredients.map(ingredient => ({
      ...ingredient,
      products: usableProducts.filter(product => productMatchesIngredient(product, ingredient))
    }));
    const matchedProducts = ingredients.flatMap(ingredient => ingredient.products)
      .filter((product, index, list) => list.findIndex(item => item.id === product.id) === index)
      .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "pl"));
    return { ...recipe, ingredients, matchedProducts, priorityProduct: matchedProducts[0] };
  })
    .filter(recipe => recipe.matchedProducts.length > 0)
    .sort((a, b) => a.priorityProduct.date.localeCompare(b.priorityProduct.date) ||
      b.matchedProducts.length - a.matchedProducts.length ||
      a.title.localeCompare(b.title, "pl"));
}
function renderRecipes() {
  const suggestions = recipeSuggestions();
  $("navRecipeCount").textContent = suggestions.length;
  $("recipeList").innerHTML = suggestions.map(recipe => {
    const priority = recipe.priorityProduct;
    const days = daysUntil(priority.date);
    const priorityLabel = days === 0 ? "termin dziś" : days === 1 ? "termin jutro" : `termin za ${days} dni`;
    const matchedCount = recipe.ingredients.filter(ingredient => ingredient.products.length).length;
    const ingredients = recipe.ingredients.map(ingredient => {
      const matched = ingredient.products.length > 0;
      const details = matched
        ? ingredient.products.map(product => `${escapeHTML(product.name)} · ${formatDate(product.date)}`).join(", ")
        : "do uzupełnienia";
      return `<li class="${matched ? "ingredient-matched" : "ingredient-missing"}"><span aria-hidden="true">${matched ? "✓" : "○"}</span><span><strong>${escapeHTML(ingredient.name)}</strong><small>${details}</small></span></li>`;
    }).join("");
    const steps = recipe.steps.map(step => `<li>${escapeHTML(step)}</li>`).join("");
    return `<article class="recipe-card" role="listitem">
      <figure class="recipe-photo">
        <a class="recipe-photo-link" href="${escapeHTML(recipe.sourceUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Zobacz oryginalny przepis: ${escapeHTML(recipe.sourceTitle)}">
          <img src="${escapeHTML(recipe.imageUrl)}" alt="Gotowe danie: ${escapeHTML(recipe.title)}" loading="lazy" decoding="async">
        </a>
        <figcaption>Zdjęcie: BBC Good Food</figcaption>
      </figure>
      <div class="recipe-card-head">
        <div><span class="recipe-kicker">GOTOWE W ${escapeHTML(recipe.time)}</span><h3>${escapeHTML(recipe.title)}</h3></div>
        <span class="recipe-priority"><span aria-hidden="true">◷</span> Najpierw: ${escapeHTML(priority.name)} · ${formatDate(priority.date)} (${escapeHTML(priorityLabel)})</span>
      </div>
      <p class="recipe-match">Wykorzystasz ${matchedCount} z ${recipe.ingredients.length} składników z Twojej spiżarni.</p>
      <h4>Składniki</h4>
      <ul class="recipe-ingredients">${ingredients}</ul>
      <h4>Przygotowanie</h4>
      <ol class="recipe-steps">${steps}</ol>
      <a class="recipe-source" href="${escapeHTML(recipe.sourceUrl)}" target="_blank" rel="noopener noreferrer">Oryginalny przepis: ${escapeHTML(recipe.sourceTitle)} <span aria-hidden="true">↗</span></a>
    </article>`;
  }).join("");
  const hasSuggestions = suggestions.length > 0;
  $("recipeList").classList.toggle("hidden", !hasSuggestions);
  $("recipeEmpty").classList.toggle("hidden", hasSuggestions);
  if (!hasSuggestions) {
    const hasUsableProducts = products.some(product => !product.used && daysUntil(product.date) >= 0);
    $("recipeEmptyTitle").textContent = hasUsableProducts ? "Brak pasujących przepisów" : "Nie masz jeszcze produktów?";
    $("recipeEmptyText").textContent = hasUsableProducts
      ? "Dodaj nazwę produktu, np. jajka, banan lub pomidor, aby znaleźć pasujący pomysł."
      : "Możesz mimo to opisać danie powyżej — AI przygotuje przepis także bez listy produktów.";
  }
}
function setAiMessage(message, isError = false) {
  const result = $("aiResult");
  result.textContent = message;
  result.classList.toggle("ai-error", isError);
  result.classList.remove("hidden");
}
$("aiForm").addEventListener("submit", async event => {
  event.preventDefault();
  const usableProducts = products
    .filter(product => !product.used && daysUntil(product.date) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 40)
    .map(({ name, date }) => ({ name, date }));
  if (!usableProducts.length && !$("aiPreferences").value.trim()) {
    setAiMessage("Opisz, jakiego przepisu szukasz, a przygotuję propozycję.", true);
    return;
  }

  const button = $("aiSubmit");
  button.disabled = true;
  button.textContent = "Piszę przepis…";
  $("aiResult").classList.add("hidden");
  try {
    const response = await fetch("/api/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: usableProducts,
        preferences: $("aiPreferences").value.trim()
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = response.status === 429
        ? "Osiągnięto limit zapytań. Spróbuj ponownie później."
        : response.status === 503
          ? "Asystent AI nie jest jeszcze skonfigurowany na serwerze."
          : "Nie udało się teraz napisać przepisu. Spróbuj ponownie później.";
      setAiMessage(message, true);
      return;
    }
    if (typeof result.recommendations !== "string" || !result.recommendations.trim()) {
      setAiMessage("Asystent nie zwrócił przepisu. Spróbuj opisać, na co masz ochotę.", true);
      return;
    }
    setAiMessage(result.recommendations.trim());
  } catch {
    setAiMessage("Nie można połączyć się z asystentem. Uruchom stronę przez skonfigurowany serwer.", true);
  } finally {
    button.disabled = false;
    button.textContent = "Napisz przepis";
  }
});
function visibleProducts() {
  const search = $("searchInput").value.trim().toLocaleLowerCase("pl");
  const category = $("categoryFilter").value;
  return products
    .filter(p => {
      const status = getStatus(p);
      const matchesView = currentView === "all" ||
        (currentView === "soon" && status.key === "soon") ||
        (currentView === "expired" && status.key === "expired") ||
        (currentView === "used" && p.used);
      const matchesSearch = `${p.name} ${p.category} ${p.notes || ""}`.toLocaleLowerCase("pl").includes(search);
      const matchesCategory = category === "all" || p.category === category;
      return matchesView && matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      if (a.used !== b.used) return a.used ? 1 : -1;
      return a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "pl");
    });
}
function render() {
  const active = products.filter(p => !p.used);
  const soon = active.filter(p => getStatus(p).key === "soon").length;
  const expired = active.filter(p => getStatus(p).key === "expired").length;
  const used = products.filter(p => p.used).length;
  $("statAll").textContent = active.length;
  $("statSoon").textContent = soon;
  $("statExpired").textContent = expired;
  $("statUsed").textContent = used;
  $("navAllCount").textContent = active.length;
  $("impactBar").style.width = `${Math.min(100, used * 10)}%`;
  $("impactText").textContent = used ? `Świetnie! Zużyto już ${used} ${used === 1 ? "produktu" : "produktów"}.` : "Oznacz produkt jako zużyty, by śledzić postępy.";
  const title = viewTitles[currentView];
  $("pageTitle").textContent = title[0];
  $("pageSubtitle").textContent = title[1];
  const recipesView = currentView === "recipes";
  $("welcomeBanner").classList.toggle("hidden", recipesView);
  $("statsGrid").classList.toggle("hidden", recipesView);
  $("productsSection").classList.toggle("hidden", recipesView);
  $("recipeSection").classList.toggle("hidden", !recipesView);
  if (!recipesView) {
    $("listHeading").textContent = title[2];
    $("listDescription").textContent = title[3];
  }
  document.querySelectorAll(".nav-item").forEach(btn => {
    const isActive = btn.dataset.view === currentView;
    btn.classList.toggle("active", isActive);
    if (isActive) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });

  const list = $("productList");
  const items = visibleProducts();
  list.innerHTML = items.map(p => {
    const status = getStatus(p);
    const emoji = categoryEmoji[p.category] || "🥫";
    return `<article class="product-row" role="listitem">
      <div class="product-main"><div class="product-emoji">${emoji}</div><div><div class="product-name">${escapeHTML(p.name)}</div><div class="product-meta">${escapeHTML(p.category)}${p.notes ? " · " + escapeHTML(p.notes) : ""}</div></div></div>
      <div class="product-details">
        <div class="date-cell"><span class="cell-label">Data ważności</span><span class="cell-value">${formatDate(p.date)}</span></div>
        <div class="qty-cell"><span class="cell-label">Ilość</span><span class="cell-value">${escapeHTML(p.qty)} szt.</span></div>
        <div class="status-cell"><span class="cell-label">Status terminu</span><span class="status-pill ${status.className}"><span aria-hidden="true">${status.className === "expired" ? "!" : status.className === "soon" ? "◷" : status.className === "used" ? "✓" : "●"}</span> ${escapeHTML(status.label)}</span></div>
      </div>
      <div class="row-actions">
        ${!p.used ? `<button class="icon-btn" title="Oznacz jako zużyty" aria-label="Oznacz ${escapeHTML(p.name)} jako zużyty" data-action="used" data-id="${p.id}">✓</button>` : `<button class="icon-btn" title="Przywróć produkt" aria-label="Przywróć ${escapeHTML(p.name)}" data-action="restore" data-id="${p.id}">↶</button>`}
        <button class="icon-btn" title="Edytuj" aria-label="Edytuj ${escapeHTML(p.name)}" data-action="edit" data-id="${p.id}">✎</button>
        <button class="icon-btn delete" title="Usuń" aria-label="Usuń ${escapeHTML(p.name)}" data-action="delete" data-id="${p.id}">×</button>
      </div>
    </article>`;
  }).join("");
  $("emptyState").classList.toggle("hidden", items.length > 0);
  list.classList.toggle("hidden", items.length === 0);
  renderRecipes();
}
function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}
function openDialog(product = null) {
  $("productForm").reset();
  $("productId").value = product?.id || "";
  $("modalTitle").textContent = product ? "Edytuj produkt" : "Dodaj produkt";
  $("productName").value = product?.name || "";
  $("productDate").value = product?.date || localISODate();
  $("productQty").value = product?.qty || 1;
  $("productCategory").value = product?.category || "Nabiał";
  $("productNotes").value = product?.notes || "";
  $("productDialog").showModal();
  $("productName").focus();
}
function closeDialog() { $("productDialog").close(); }

$("openAdd").addEventListener("click", () => openDialog());
$("emptyAdd").addEventListener("click", () => openDialog());
$("recipeEmptyAdd").addEventListener("click", () => openDialog());
$("closeModal").addEventListener("click", closeDialog);
$("cancelModal").addEventListener("click", closeDialog);
$("seeSoon").addEventListener("click", () => { currentView = "soon"; render(); document.querySelector(".products-section").scrollIntoView({ behavior: "smooth", block: "start" }); });
$("searchInput").addEventListener("input", render);
$("categoryFilter").addEventListener("change", render);
document.querySelectorAll(".nav-item").forEach(btn => btn.addEventListener("click", () => { currentView = btn.dataset.view; render(); }));

$("productForm").addEventListener("submit", event => {
  event.preventDefault();
  const id = $("productId").value;
  const product = {
    id: id || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
    name: $("productName").value.trim(),
    date: $("productDate").value,
    qty: Math.max(1, Number.parseInt($("productQty").value, 10) || 1),
    category: $("productCategory").value,
    notes: $("productNotes").value.trim(),
    used: id ? Boolean(products.find(p => p.id === id)?.used) : false,
    createdAt: id ? products.find(p => p.id === id)?.createdAt || Date.now() : Date.now()
  };
  if (!product.name || !product.date) return;
  if (id) products = products.map(p => p.id === id ? product : p);
  else products.push(product);
  saveProducts();
  closeDialog();
  render();
  showToast(id ? "Zapisano zmiany produktu" : "Dodano produkt do spiżarni");
});

$("productList").addEventListener("click", event => {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;
  const product = products.find(p => p.id === btn.dataset.id);
  if (!product) return;
  const action = btn.dataset.action;
  if (action === "edit") openDialog(product);
  if (action === "delete") {
    if (confirm(`Czy na pewno usunąć produkt „${product.name}”?`)) {
      products = products.filter(p => p.id !== product.id);
      saveProducts(); render(); showToast("Usunięto produkt");
    }
  }
  if (action === "used") {
    product.used = true; product.usedAt = Date.now();
    saveProducts(); render(); showToast(`Super! „${product.name}” oznaczono jako zużyty.`);
  }
  if (action === "restore") {
    product.used = false; delete product.usedAt;
    saveProducts(); render(); showToast("Przywrócono produkt do spiżarni");
  }
});

$("exportBtn").addEventListener("click", () => {
  const data = JSON.stringify({ exportedAt: new Date().toISOString(), products }, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "freshtrack-dane.json"; a.click();
  URL.revokeObjectURL(url);
  showToast("Przygotowano eksport danych");
});

render();
