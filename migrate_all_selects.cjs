const fs = require('fs');

function migrateSettings() {
  let text = fs.readFileSync('src/components/Settings.tsx', 'utf8');
  if (text.includes("import { Select }")) return;
  
  text = text.replace(/import \{.*?\} from "lucide-react";/, (match) => {
    return match + '\nimport { Select } from "./Select";';
  });

  text = text.replace(/<select\s*value=\{settings\.language\}\s*onChange=\{\(e\) =>\s*setSettings\(\{ \.\.\.settings, language: e\.target\.value \}\)\s*\}\s*className="[^"]*"\s*>\s*([\s\S]*?)<\/select>/,
  `<Select
                  value={settings.language}
                  onChange={(val) => setSettings({ ...settings, language: val })}
                  options={[
                    { value: "en", label: "English" },
                    { value: "es", label: "Spanish" },
                    { value: "fr", label: "French" },
                    { value: "de", label: "German" },
                  ]}
                />`);
  
  fs.writeFileSync('src/components/Settings.tsx', text);
}

function migrateAdvancedAnalytics() {
  let text = fs.readFileSync('src/components/AdvancedAnalytics.tsx', 'utf8');
  if (text.includes("import { ChannelSelector }")) return;
  text = text.replace('import { Users, ', 'import { ChannelSelector } from "./ChannelSelector";\nimport { Users, ');
  
  text = text.replace(/<select\s*value=\{digestChannelId\}[\s\S]*?disabled=\{savingDigest \|\| !isPro\}[\s\S]*?className="[^"]*"[\s\S]*?>\s*<option value="">Disabled<\/option>\s*\{discordChannels\.map\(\(c: any\) => \(\s*<option key=\{c\.id\} value=\{c\.id\}>\s*#\{c\.name\}\s*<\/option>\s*\)\)\}\s*<\/select>/,
  `<ChannelSelector
                    channels={discordChannels}
                    value={digestChannelId}
                    onChange={(val) => setDigestChannelId(val)}
                    placeholder="Disabled"
                  />`);
  
  fs.writeFileSync('src/components/AdvancedAnalytics.tsx', text);
}

function migrateCustomCommandsBuilder() {
    let text = fs.readFileSync('src/components/CustomCommandsBuilder.tsx', 'utf8');
    if (text.includes("import { Select }")) return;
    text = text.replace('import { useServer } from "../context/ServerContext";', 'import { useServer } from "../context/ServerContext";\nimport { Select } from "./Select";');

    text = text.replace(/<select[\s\S]*?disabled=\{!isPro\}[\s\S]*?value=\{selectedCommand\.permission \|\| "everyone"\}[\s\S]*?onChange=\{\(e\) =>[\s\S]*?handleUpdate\(selectedCommand\.id, \{[\s\S]*?permission: e\.target\.value as "everyone" \| "moderator",[\s\S]*?\}\)[\s\S]*?\}[\s\S]*?className="[^"]*"[\s\S]*?>\s*<option value="everyone">Everyone<\/option>\s*<option value="moderator">Moderators Only<\/option>\s*<\/select>/,
    `<Select
                      disabled={!isPro}
                      value={selectedCommand.permission || "everyone"}
                      onChange={(val) =>
                        handleUpdate(selectedCommand.id, {
                          permission: val as "everyone" | "moderator",
                        })
                      }
                      options={[
                        { value: "everyone", label: "Everyone" },
                        { value: "moderator", label: "Moderators Only" },
                      ]}
                    />`);

    text = text.replace(/<select[\s\S]*?disabled=\{!isPro\}[\s\S]*?value=\{selectedCommand\.requiresUser \? "yes" : "no"\}[\s\S]*?onChange=\{\(e\) =>[\s\S]*?handleUpdate\(selectedCommand\.id, \{[\s\S]*?requiresUser: e\.target\.value === "yes",[\s\S]*?\}\)[\s\S]*?\}[\s\S]*?className="[^"]*"[\s\S]*?>\s*<option value="no">No \(Independent\)<\/option>\s*<option value="yes">Yes \(@user or target\)<\/option>\s*<\/select>/,
    `<Select
                      disabled={!isPro}
                      value={selectedCommand.requiresUser ? "yes" : "no"}
                      onChange={(val) =>
                        handleUpdate(selectedCommand.id, {
                          requiresUser: val === "yes",
                        })
                      }
                      options={[
                        { value: "no", label: "No (Independent)" },
                        { value: "yes", label: "Yes (@user or target)" },
                      ]}
                    />`);
    
    fs.writeFileSync('src/components/CustomCommandsBuilder.tsx', text);
}

function migrateModQueue() {
    let text = fs.readFileSync('src/components/ModQueue.tsx', 'utf8');
    if (text.includes("import { Select }")) return;
    text = text.replace('import { useServer } from "../context/ServerContext";', 'import { useServer } from "../context/ServerContext";\nimport { Select } from "./Select";');

    text = text.replace(/<select\s*value=\{flagFilter\}\s*onChange=\{\(e\) => \{\s*setFlagFilter\(e\.target\.value\);\s*setCurrentPage\(1\);\s*\}\}\s*className="[^"]*"\s*>\s*<option value="all">All Flags<\/option>\s*<option value="high">High Confidence \(>80%\)<\/option>\s*<option value="pending">Pending<\/option>\s*<option value="resolved">Resolved<\/option>\s*<\/select>/,
    `<Select
                          value={flagFilter}
                          onChange={(val) => {
                            setFlagFilter(val);
                            setCurrentPage(1);
                          }}
                          className="w-[180px]"
                          options={[
                            { value: "all", label: "All Flags" },
                            { value: "high", label: "High Confidence (>80%)" },
                            { value: "pending", label: "Pending" },
                            { value: "resolved", label: "Resolved" },
                          ]}
                        />`);
    
    fs.writeFileSync('src/components/ModQueue.tsx', text);
}

function migrateReportsManager() {
    let text = fs.readFileSync('src/components/ReportsManager.tsx', 'utf8');
    if (text.includes("import { Select }")) return;
    text = text.replace('import { useServer } from "../context/ServerContext";', 'import { useServer } from "../context/ServerContext";\nimport { Select } from "./Select";');

    text = text.replace(/<select\s*className="[^"]*"\s*value=\{statusFilter\}\s*onChange=\{\(e\) => setStatusFilter\(e\.target\.value\)\}\s*>\s*<option value="all">All Status<\/option>\s*<option value="pending">Pending<\/option>\s*<option value="resolved">Resolved<\/option>\s*<option value="dismissed">Dismissed<\/option>\s*<\/select>/,
    `<Select
              value={statusFilter}
              onChange={(val) => setStatusFilter(val)}
              className="w-[160px]"
              options={[
                { value: "all", label: "All Status" },
                { value: "pending", label: "Pending" },
                { value: "resolved", label: "Resolved" },
                { value: "dismissed", label: "Dismissed" },
              ]}
            />`);
    
    fs.writeFileSync('src/components/ReportsManager.tsx', text);
}

function migrateHealthScore() {
    let text = fs.readFileSync('src/components/HealthScore.tsx', 'utf8');
    if (text.includes("import { ChannelSelector }")) return;
    text = text.replace('import { useServer } from "../context/ServerContext";', 'import { useServer } from "../context/ServerContext";\nimport { ChannelSelector } from "./ChannelSelector";\nimport { Select } from "./Select";');

    text = text.replace(/<select\s*value=\{widgetSettings\.channelId\}[\s\S]*?onChange=\{\(e\) => setWidgetSettings\(prev => \(\{ \.\.\.prev, channelId: e\.target\.value \}\)\)\}[\s\S]*?className="[^"]*"[\s\S]*?>\s*<option value="" disabled>Select a channel<\/option>\s*\{discordChannels\.map\(\(c: any\) => \(\s*<option key=\{c\.id\} value=\{c\.id\}>\s*#\{c\.name\}\s*<\/option>\s*\)\)\}\s*<\/select>/,
    `<ChannelSelector
                channels={discordChannels}
                value={widgetSettings.channelId}
                onChange={(val) => setWidgetSettings(prev => ({ ...prev, channelId: val }))}
                placeholder="Select a channel..."
              />`);

    text = text.replace(/<select\s*value=\{widgetSettings\.badgeStyle\}[\s\S]*?onChange=\{\(e\) => setWidgetSettings\(prev => \(\{ \.\.\.prev, badgeStyle: e\.target\.value \}\)\)\}[\s\S]*?className="[^"]*"[\s\S]*?>\s*<option value="shield">👑 App Logo Badge<\/option>\s*<option value="dot">🟢 Minimal Dot<\/option>\s*<option value="pill">💊 Text Pill<\/option>\s*<\/select>/,
    `<Select
                         value={widgetSettings.badgeStyle}
                         onChange={(val) => setWidgetSettings(prev => ({ ...prev, badgeStyle: val }))}
                         options={[
                           { value: "shield", label: "👑 App Logo Badge" },
                           { value: "dot", label: "🟢 Minimal Dot" },
                           { value: "pill", label: "💊 Text Pill" },
                         ]}
                       />`);

    text = text.replace(/<select\s*value=\{widgetSettings\.milestoneChannelId\}[\s\S]*?onChange=\{\(e\) => setWidgetSettings\(prev => \(\{ \.\.\.prev, milestoneChannelId: e\.target\.value \}\)\)\}[\s\S]*?className="[^"]*"[\s\S]*?>\s*<option value="">Same as Public Widget Channel<\/option>\s*\{discordChannels\.map\(\(c: any\) => \(\s*<option key=\{c\.id\} value=\{c\.id\}>\s*#\{c\.name\}\s*<\/option>\s*\)\)\}\s*<\/select>/,
    `<ChannelSelector
                      channels={discordChannels}
                      value={widgetSettings.milestoneChannelId}
                      onChange={(val) => setWidgetSettings(prev => ({ ...prev, milestoneChannelId: val }))}
                      placeholder="Same as Public Widget Channel"
                    />`);
    
    fs.writeFileSync('src/components/HealthScore.tsx', text);
}

migrateSettings();
migrateAdvancedAnalytics();
migrateCustomCommandsBuilder();
migrateModQueue();
migrateReportsManager();
migrateHealthScore();
