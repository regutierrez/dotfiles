-- Pull in the wezterm API
local wezterm = require("wezterm")

-- This will hold the configuration.
local config = wezterm.config_builder()

config.enable_scroll_bar = true
-- config.font = wezterm.font 'MesloLGS Nerd Font Mono'
-- config.color_scheme = 'TokyoNight'
-- config.color_scheme = 'Chalk (dark) (terminal.sexy)'
config.window_decorations = "INTEGRATED_BUTTONS|RESIZE"

-- and finally, return the configuration to wezterm
return config
