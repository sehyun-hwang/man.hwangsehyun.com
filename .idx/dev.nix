# To learn more about how to use Nix to configure your environment
# see: https://developers.google.com/idx/guides/customize-idx-env
{ pkgs, ... }: {
  channel = "stable-23.11"; # "stable-23.11" or "unstable"
  # Use https://search.nixos.org/packages to  find packages
  packages = [
    pkgs.nodejs
    pkgs.corepack
    pkgs.fish
    pkgs.hugo
    pkgs.nodePackages.eslint
  ];
  # Sets environment variables in the workspace
  env = {
    CLOUDANT_APIKEY = "WaBX9uzUPM0lvHiw_uV3fRUX8pMrpughMgR3E2DaTjFr";
  };

  idx = {
    # search for the extension on https://open-vsx.org/ and use "publisher.id"
    extensions = [
      "DavidAnson.vscode-markdownlint"
      "dbaeumer.vscode-eslint"
      "jnoortheen.nix-ide"
      "streetsidesoftware.code-spell-checker"
      "usernamehw.errorlens"
    ];

    previews = {
      enable = true;
      previews = [
        {
          command = ["hugo" "server"];
          manager = "web";
          id = "hugo";
        }
      ];
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
