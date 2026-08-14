from analyze_hand import main
import sys

if __name__ == "__main__":
    player = input("Player cards: ").strip()
    dealer = input("Known dealer card (blank for none): ").strip()
    board = input("Community cards (0, 2, or 4): ").strip()
    sys.argv = [sys.argv[0], "--player", player, "--board", board] + (["--dealer-visible", dealer] if dealer else [])
    main()
