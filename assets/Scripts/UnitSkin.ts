import { Color, Label, Material, MeshRenderer } from 'cc';
import { ColorType } from './Types';

/**
 * Скин кролика: 3 материала по слотам меша Unit_Bunny (корпус, детали, блик)
 * и стиль числа на груди.
 */
export class UnitSkin {
    /** Назначает материалы всем слотам меша. Массив — [корпус, детали, блик]; одиночный материал — только слот 0 */
    public static apply(renderer: MeshRenderer | null, skin: Material | Material[] | null) {
        if (!renderer || !skin) return;
        const mats = Array.isArray(skin) ? skin : [skin];
        mats.forEach((m, i) => { if (m) renderer.setSharedMaterial(m, i); });
    }

    /** Число: у черных юнитов белое с темной обводкой, у белых — черное со светлой обводкой */
    public static styleLabel(label: Label | null, colorType: ColorType, alpha: number = 255) {
        if (!label) return;
        const black = colorType === ColorType.BLACK;
        label.color = black ? new Color(255, 255, 255, alpha) : new Color(20, 20, 28, alpha);
        label.isBold = true;
        label.enableOutline = true;
        label.outlineColor = black ? new Color(20, 20, 28, alpha) : new Color(255, 255, 255, alpha);
        label.outlineWidth = 3;
    }
}
