const fs = require('fs').promises;
const xml2js = require('xml2js');

const parser = new xml2js.Parser();
const fileMarket = 'ModuleData/Markets/weaponmarketall.xml';
const fileCrafting = 'ModuleData/CraftingRecipies/all_weapons.xml';

function parseTierCraftings(tierCraftingsString, tier) {
  const recipes = tierCraftingsString.split('|');
  const clothMaterials = ['pe_linen', 'pe_cloth', 'pe_velvet'];
  const metalMaterials = ['pe_iron_ingot', 'pe_steel_ingot', 'pe_thamaskene_steel'];

  const parsedRecipes = recipes.map((recipe) => {
    const [craftingTimeString, craftingRecipeString] = recipe.split('=');
    const [craftingTime, itemId, amount = null] = craftingTimeString.split('*').map((part) => part.trim());
    const ingredients = craftingRecipeString.split(',').map((ingredientPair) => {
      const [ingredient, value] = ingredientPair.split('*').map((part) => part.trim());

      let replacedIngredient = ingredient;
      if (ingredient === 'clothmaterial') {
        replacedIngredient = clothMaterials[tier - 1];
      } else if (ingredient === 'metalmaterial') {
        replacedIngredient = metalMaterials[tier - 1];
      }

      return { [replacedIngredient]: parseInt(value, 10) };
    });

    return {
      id: itemId,
      crafting_recipe: Object.assign({}, ...ingredients),
      count: amount ? parseInt(amount, 10) : null,
      crafting_time: parseInt(craftingTime, 10),
    };
  });

  return parsedRecipes;
}


const tierPriceMultiplier = 1000;

async function mergeData(inputFilePath1, inputFilePath2, outputFilePath) {
  try {
    const [craftingData, marketData] = await Promise.all([
      readCraftingXMLFile(inputFilePath1),
      readfilenameXMLFile(inputFilePath2),
    ]);

    const mergedData = {
      Tier1: [],
      Tier2: [],
      Tier3: [],
      Tier4: [],
    };

    for (const tier in marketData) {
      for (const marketItem of marketData[tier]) {
        let mergedItem = null;
        if (marketItem.id) { // Exclude items without an "id" field
          for (const craftingTier in craftingData) {
            const craftingItem = craftingData[craftingTier].find((item) => item.id === marketItem.id);
            if (craftingItem) {
              const tierNumber = parseInt(craftingTier.replace('Tier', ''), 10);
              const priceMultiplier = tierNumber * tierPriceMultiplier;

              mergedItem = {
                ...marketItem,
                ...craftingItem,
                buy_price: marketItem.buy_price + priceMultiplier,
                sell_price: Math.floor((marketItem.buy_price + priceMultiplier) * 0.8), // Calculate the sell_price using the scale
              };
              mergedData[craftingTier].push(mergedItem); // Push the item to the respective tier in mergedData
              break;
            }
          }
          if (!mergedItem) {
            mergedData[tier].push(marketItem); // Push the marketItem if no craftingItem was found
          }
        }
      }
    }

    await saveJsonFile(outputFilePath, mergedData);
  } catch (error) {
    console.error('Error merging data:', error);
  }
}


function parseTierItems(tierItemsString) {
  const items = tierItemsString.split('|');
  const sellPriceScale = 0.8; // You can set the desired scale value for the sell_price here

  const parsedItems = items.map((item) => {
    const [id, sell_price, buy_price] = item.split('*');
    const buyPrice = Math.floor(parseInt(buy_price, 10));
    const sellPrice = Math.floor(buyPrice * sellPriceScale); // Calculate the sell_price using the scale

    return {
      id: id.trim(),
      sell_price: sellPrice,
      buy_price: buyPrice,
    };
  });
  return parsedItems;
}

async function saveJsonFile(filePath, data) {
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    console.log(`Data saved to ${filePath}`);
  } catch (error) {
    console.error('Error writing JSON file:', error);
  }
}

async function readCraftingXMLFile(inputFilePath) {
  try {
    const xmlData = await fs.readFile(inputFilePath, 'utf8');
    const parsedData = await parser.parseStringPromise(xmlData);

    const recipiesData = parsedData.Recipies;
    const tier1Craftings = parseTierCraftings(recipiesData.Tier1Craftings[0], 1);
    const tier2Craftings = parseTierCraftings(recipiesData.Tier2Craftings[0], 2);
    const tier3Craftings = parseTierCraftings(recipiesData.Tier3Craftings[0], 3);

    const allCraftings = {
      Tier1: tier1Craftings,
      Tier2: tier2Craftings,
      Tier3: tier3Craftings,
    };

    return allCraftings;
  } catch (error) {
    console.error('Error reading or parsing XML file:', error);
  }
}


async function readfilenameXMLFile(inputFilePath) {
  try {
    const xmlData = await fs.readFile(inputFilePath, 'utf8');
    const parsedData = await parser.parseStringPromise(xmlData);

    const marketData = parsedData.Market;
    const tier1Items = parseTierItems(marketData.Tier1Items[0]);
    const tier2Items = parseTierItems(marketData.Tier2Items[0]);
    const tier3Items = parseTierItems(marketData.Tier3Items[0]);
    const tier4Items = parseTierItems(marketData.Tier4Items[0]);

    const allItems = {
      Tier1: tier1Items,
      Tier2: tier2Items,
      Tier3: tier3Items,
      Tier4: tier4Items,
    };

    return allItems;
  } catch (error) {
    console.error('Error reading or parsing XML file:', error);
  }
}

const outputFilePath = 'gen_json_debug/weapons.json';
mergeData(fileCrafting, fileMarket, outputFilePath);
