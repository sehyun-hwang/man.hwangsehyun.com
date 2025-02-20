# To learn more about how to use Nix to configure your environment
# see: https://developers.google.com/idx/guides/customize-idx-env
{pkgs, ...}: {
  channel = "stable-24.11"; # "stable-23.11" or "unstable"
  # Use https://search.nixos.org/packages to  find packages
  packages = with pkgs; [
    alejandra
    chromium
    corepack_22
    fish
    gitleaks
    gnumake
    hugo
    nodejs_22
  ];
  # Sets environment variables in the workspace
  env = {
    ESLINT_USE_FLAT_CONFIG = "true";
  };

  idx = {
    # search for the extension on https://open-vsx.org/ and use "publisher.id"
    extensions = [
      "amazonwebservices.aws-toolkit-vscode"
      "DavidAnson.vscode-markdownlint"
      "dbaeumer.vscode-eslint"
      "esbenp.prettier-vscode"
      "jnoortheen.nix-ide"
      "kamadorueda.alejandra"
      "tekumara.typos-vscode"
      "usernamehw.errorlens"
    ];

    previews = {
      enable = true;
      previews.web = {
        command = ["sh" "base-web-host.sh" "hugo" "server" "-p" "$PORT" "--liveReloadPort" "443" "--appendPort=false"];
        manager = "web";
      };
    };

    workspace = {
      # runs when a workspace is first created with this `dev.nix` file
      # to run something each time the environment is rebuilt, use the `onStart` hook
      onCreate = {
        activate-pnpm = "corepack prepare --activate pnpm@latest";
        install-nextlab-eslint = "yarn global add https://github.com/sehyun-hwang/eslint-config-nextlab";
        update-git-submodules = "git submodule update --init";
      };

      onStart = {
        pnpm-install = "pnpm i";
      };
    };
  };
}
