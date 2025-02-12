// Require the necessary discord.js classes
import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";
import ms from "ms";
import { fileURLToPath } from "url";
import {
  Client,
  Events,
  Collection,
  GatewayIntentBits,
  ActivityType,
  REST,
  Routes,
} from "discord.js";
import "dotenv/config";
import supabase from "./modules/supabase.js";
import { initTokens, reloadTokens } from "./modules/loadbalancer.js";

// Create a new client instance
const client: any = new Client({
  intents: [GatewayIntentBits.Guilds],
});
const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

client.commands = new Collection();
const commands = [];
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const commandsPath = path.join(__dirname, "commands");

const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = `./commands/${file}`;
  const { default: command } = await import(filePath);
  // Set a new item in the Collection with the key as the command name and the value as the exported module
  if ("data" in command && "execute" in command) {
    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());
  } else {
    console.log(
      chalk.yellow(
        `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`
      )
    );
  }
}

// Construct and prepare an instance of the REST module

// and deploy your commands!
(async () => {
  try {
    console.log(
      `Started refreshing ${commands.length} application (/) commands.`
    );

    // The put method is used to fully refresh all commands in the guild with the current set
    const data = await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log(`Successfully reloaded application (/) commands.`);
  } catch (error) {
    // And of course, make sure you catch and log any errors!
    console.error(error);
  }
})();

// When the client is ready, run this code (only once)
// We use 'c' for the event parameter to keep it separate from the already defined 'client'
async function removeDuplactes() {
  const { data, error } = await supabase
    .from("results")
    .select("*")
    .eq("provider", "chatgpt")
    .range(0, 1000);
  for (var i = 0; i < data.length; i++) {
    var { data: existMore } = await supabase
      .from("results")
      .select("*")
      .eq("provider", "chatgpt")
      .eq("prompt", data[i].prompt);
    if (existMore.length > 2) {
      existMore = existMore.sort(function (a: any, b: any) {
        var aD: any = new Date(a.created_at);
        var bD: any = new Date(b.created_at);

        return aD - bD;
      });
      var first = existMore[0];
      var totalUses = 0;
      for (var j = 0; j < existMore.length; j++) {
        totalUses = totalUses + parseInt(existMore[j].uses);
        if (existMore[j].id != first.id) {
          const { data, error } = await supabase
            .from("results")
            .delete()
            .eq("id", existMore[j].id);
          console.log(`delete ${existMore[j].id}`);
        }
      }
      const { data, error } = await supabase
        .from("results")
        .update({ uses: totalUses })
        .eq("id", first.id);
      console.log(totalUses);
    }
  }
  console.log("completed");
}

client.once(Events.ClientReady, async (c) => {
  client.user.setPresence({
    activities: [
      { name: `Starting bot... | dsc.gg/turing`, type: ActivityType.Playing },
    ],
    status: "online",
  });

  await reloadTokens();
  setInterval(async () => {
    await reloadTokens();
  }, ms("10m"));
  await initTokens();
  console.log(
    chalk.white(`Ready! Logged in as `) + chalk.blue.bold(c.user.tag)
  );

  const { data, error } = await supabase
    .from("conversations")
    .delete()
    .eq("abled", true);
  client.user.setPresence({
    activities: [
      { name: `v0.1.6 | dsc.gg/turing`, type: ActivityType.Playing },
    ],
    status: "online",
  });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction, client, commands);
  } catch (error) {
    console.error(error);
    await interaction.reply({
      content: "There was an error while executing this command!",
      ephemeral: true,
    });
  }
});

// Log in to Discord with your client's token
client.login(process.env.TOKEN);
