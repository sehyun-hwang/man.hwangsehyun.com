# To learn more about how to use Nix to configure your environment
# see: https://developers.google.com/idx/guides/customize-idx-env
{ pkgs, ... }: {
  channel = "stable-23.11"; # "stable-23.11" or "unstable"
  # Use https://search.nixos.org/packages to  find packages
  packages = [
    pkgs.nodejs
    pkgs.corepack
    pkgs.fish
    pkgs.nodePackages.eslint
  ];
  # Sets environment variables in the workspace
  env = {
    CLOUDANT_APIKEY = "WaBX9uzUPM0lvHiw_uV3fRUX8pMrpughMgR3E2DaTjFr";
  };

  idx = {
    # search for the extension on https://open-vsx.org/ and use "publisher.id"
    extensions = [
      "dbaeumer.vscode-eslint"
      "jnoortheen.nix-ide"
      "DavidAnson.vscode-markdownlint"
      "usernamehw.errorlens"
    ];

    previews = {
      enable = false;
      # previews = [
      #   {
      #     command = ["npm" "run" "start" "--" "--port" "$PORT"];
      #     manager = "web";
      #     id = "web";
      #   }
      #   {
      #     manager = "ios";
      #     id = "ios";
      #   }
      # ];
    };

    workspace = {
      # runs when a workspace is first created with this `dev.nix` file
      # to run something each time the environment is rebuilt, use the `onStart` hook
      onCreate = {
        install-nextlab-eslint = "yarn global add https://github.com/nextlab-ai/public-releases#eslint";
      };

      onStart = {
        pnpm-install = "cd src && pnpm i";
      };
    };
  };
}
