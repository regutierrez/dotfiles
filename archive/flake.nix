{
  description = "Pael Darwin system flake";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    nix-darwin.url = "github:LnL7/nix-darwin";
    nix-darwin.inputs.nixpkgs.follows = "nixpkgs";
    nix-homebrew.url = "github:zhaofengli-wip/nix-homebrew";
  };

  outputs = inputs@{ self, nix-darwin, nixpkgs, nix-homebrew }:
  let
    configuration = { pkgs, config, ... }: {
      # List packages installed in system profile. To search by name, run:
      # $ nix-env -qaP | grep wget
      nixpkgs.config.allowUnfree = true;
      # put OS-agnostic apps here
      environment.systemPackages =
        [ pkgs.neovim
          pkgs.mkalias
          pkgs.tmux
          pkgs.eza
          pkgs.zoxide
          pkgs.fzf
          pkgs.tldr
          pkgs.go
          pkgs.lazygit
          pkgs.pyenv
          pkgs.pandoc
          pkgs.pipx
          # GUI apps
          pkgs.wezterm
          pkgs.vscode
        ];

      homebrew = {
        enable = true;
        casks = [
          "aldente"
          "shottr"
          "discord"
          "whatsapp"
          "homerow"
          "iina"
          "obsidian"
          "raycast"
          "zen-browser"
          "protonvpn"
        ];
        masApps = {
          "Excel" = 462058435;
          "BitWarden" = 1352778147;
        };
        onActivation.autoUpdate = true;
        onActivation.upgrade = true;
      };

      system.defaults = {
        dock.autohide = true;
        controlcenter.BatteryShowPercentage = true;
        finder._FXShowPosixPathInTitle = true;
        finder._FXSortFoldersFirst = true;
        finder.AppleShowAllExtensions = true;
        finder.FXPreferredViewStyle = "clmv";
        finder.NewWindowTarget = "Home";
        finder.QuitMenuItem = true;
        finder.ShowPathbar = true;
        finder.ShowStatusBar = true;
        NSGlobalDomain."com.apple.keyboard.fnState" = true;
        NSGlobalDomain."com.apple.mouse.tapBehavior" = 1;
        NSGlobalDomain.AppleICUForce24HourTime = true;
        NSGlobalDomain.AppleInterfaceStyle = "Dark";
        NSGlobalDomain.NSDocumentSaveNewDocumentsToCloud = false;
        NSGlobalDomain.NSTableViewDefaultSizeMode = 1;
        NSGlobalDomain.NSAutomaticInlinePredictionEnabled = false;
        NSGlobalDomain.NSWindowShouldDragOnGesture = true;
        trackpad.Clicking = true;
        trackpad.FirstClickThreshold = 0;
        trackpad.SecondClickThreshold = 0;
        trackpad.TrackpadThreeFingerDrag = true;
        universalaccess.reduceMotion = true;
      };

    system.activationScripts.applications.text = let
      env = pkgs.buildEnv {
        name = "system-applications";
        paths = config.environment.systemPackages;
        pathsToLink = "/Applications";
      };
    in
      pkgs.lib.mkForce ''
      # Set up applications.
      echo "setting up /Applications..." >&2
      rm -rf /Applications/Nix\ Apps
      mkdir -p /Applications/Nix\ Apps
      find ${env}/Applications -maxdepth 1 -type l -exec readlink '{}' + |
      while read -r src; do
        app_name=$(basename "$src")
        echo "copying $src" >&2
        ${pkgs.mkalias}/bin/mkalias "$src" "/Applications/Nix Apps/$app_name"
      done
          '';

      # Auto upgrade nix package and the daemon service.
      services.nix-daemon.enable = true;
      # nix.package = pkgs.nix;

      # Necessary for using flakes on this system.
      nix.settings.experimental-features = "nix-command flakes";

      # Create /etc/zshrc that loads the nix-darwin environment.
      programs.zsh.enable = true;  # default shell on catalina
      # programs.fish.enable = true;

      # Set Git commit hash for darwin-version.
      system.configurationRevision = self.rev or self.dirtyRev or null;

      # Used for backwards compatibility, please read the changelog before changing.
      # $ darwin-rebuild changelog
      system.stateVersion = 5;

      # The platform the configuration will be used on.
      nixpkgs.hostPlatform = "aarch64-darwin";
    };
  in
  {
    # Build darwin flake using:
    # $ darwin-rebuild build --flake .#simple
    darwinConfigurations."pael-mac" = nix-darwin.lib.darwinSystem {
      modules = [
        configuration
        nix-homebrew.darwinModules.nix-homebrew
        {
          nix-homebrew = {
            enable = true;
            # M series Macs only
            enableRosetta = true;
            user = "regutierrez";
          };
        }
      ];
    };

    # Expose the package set, including overlays, for convenience.
    darwinPackages = self.darwinConfigurations."pael-mac".pkgs;
  };
}
