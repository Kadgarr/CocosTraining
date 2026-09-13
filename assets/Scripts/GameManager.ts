import { _decorator, Component, Node, sys } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('GameManager')
export class GameManager extends Component {
    public static instance: GameManager = null!;

    @property(Node)
    public winUI: Node = null!;

    @property(Node)
    public loseUI: Node = null!;

    @property
    public storeUrlAndroid: string = 'https://play.google.com/store/apps/details?id=your.app.id';

    @property
    public storeUrlIOS: string = 'https://apps.apple.com/app/id123456789';

    private isGameOver: boolean = false;

    onLoad() {
        GameManager.instance = this;
    }

    /**
     * Проверка условия победы (все блоки на сетке уничтожены)
     */
    public checkWin(remainingBlocks: number) {
        if (this.isGameOver) return;

        if (remainingBlocks <= 0) {
            this.isGameOver = true;
            this.scheduleOnce(() => {
                if (this.winUI) this.winUI.active = true;
            }, 0.5);
        }
    }

    /**
     * Проверка условия поражения (все слоты исчерпаны, на треке нет юнитов, блоки остались)
     */
    public checkLose(maxUnits: number, activeUnitsCount: number, remainingBlocks: number) {
        if (this.isGameOver) return;

        if (maxUnits <= 0 && activeUnitsCount === 0 && remainingBlocks > 0) {
            this.isGameOver = true;
            this.scheduleOnce(() => {
                if (this.loseUI) this.loseUI.active = true;
            }, 0.5);
        }
    }

    /**
     * Обработчик клика по CTA-кнопке (Call To Action)
     */
    public onCTAClicked() {
        // Поддержка MRAID спецификации для мобильных рекламных сетей
        if ((window as any).mraid) {
            (window as any).mraid.open();
            return;
        }

        // Прямой переход в зависимости от ОС устройства
        if (sys.os === sys.OS.IOS) {
            sys.openURL(this.storeUrlIOS);
        } else {
            sys.openURL(this.storeUrlAndroid);
        }
    }
}