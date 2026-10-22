# Port-owned, pinned native Chromium capture. No personal profile or network content is used.
{
  description = "Living Code Chromium native screenshot environment";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/7fd4004d0511991fff3a0524856a9be09e28c5f0";
  outputs = { self, nixpkgs }: {
    devShells.x86_64-linux.default = let
      pkgs = import nixpkgs { system = "x86_64-linux"; };
    in pkgs.mkShell {
      packages = with pkgs; [ chromium nodejs_24 python3 git bash kitty xorg-server xdotool imagemagick dejavu_fonts ];
      CAPTURE_MESA = "${pkgs.mesa}";
      FONTCONFIG_FILE = pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts ]; };
    };
  };
}
